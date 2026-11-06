"""Download the Mac motion-test model with visible, restart-safe progress."""

from concurrent.futures import FIRST_COMPLETED, ThreadPoolExecutor, wait
import hashlib
import json
from pathlib import Path
import subprocess
import sys

from huggingface_hub import HfApi, hf_hub_download, snapshot_download


IMAGE_REPO = "stable-diffusion-v1-5/stable-diffusion-v1-5"
VIDEO_REPO = "dgrauet/ltx-2.3-mlx-q4"
TRANSFORMER = "transformer-distilled-1.1.safetensors"
VIDEO_FILES = (
    "config.json", "embedded_config.json", "quantize_config.json", "split_model.json",
    TRANSFORMER, "connector.safetensors", "vae_encoder.safetensors",
    "vae_decoder.safetensors", "spatial_upscaler_x2_v1_1.safetensors",
    "spatial_upscaler_x2_v1_1_config.json", "audio_vae.safetensors",
    "vocoder.safetensors",
)
CHUNK_SIZE = 16 * 1024 * 1024
WORKERS = 8


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(8 * 1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def download_chunk(url: str, directory: Path, index: int, start: int, end: int) -> None:
    target = directory / f"{index:05d}.chunk"
    expected = end - start + 1
    if target.is_file() and target.stat().st_size == expected:
        return
    temporary = target.with_suffix(".part")
    temporary.unlink(missing_ok=True)
    result = subprocess.run(
        ["curl", "--silent", "--show-error", "--fail", "--location",
         "--retry", "5", "--retry-all-errors", "--connect-timeout", "20",
         "--max-time", "180", "--range", f"{start}-{end}",
         "--max-filesize", str(expected), "--output", str(temporary),
         "--write-out", "%{http_code}", url],
        capture_output=True, text=True,
    )
    if (result.returncode != 0 or result.stdout != "206" or not temporary.is_file()
            or temporary.stat().st_size != expected):
        temporary.unlink(missing_ok=True)
        raise RuntimeError(f"Chunk {index + 1} failed: HTTP {result.stdout}, {result.stderr.strip()}")
    temporary.replace(target)


def download_resumable(repo: str, revision: str, name: str, size: int, digest: str, target: Path) -> None:
    if target.is_file() and target.stat().st_size == size and sha256(target) == digest:
        print(f"Verified existing {name} ({size / 1e9:.1f} GB).", flush=True)
        return
    directory = target.parent / f".{name}.parts"
    directory.mkdir(parents=True, exist_ok=True)
    count = (size + CHUNK_SIZE - 1) // CHUNK_SIZE
    url = f"https://huggingface.co/{repo}/resolve/{revision}/{name}"
    chunks = [(i, i * CHUNK_SIZE, min((i + 1) * CHUNK_SIZE, size) - 1) for i in range(count)]

    def transferred() -> int:
        total = 0
        for i, start, end in chunks:
            completed = directory / f"{i:05d}.chunk"
            partial = directory / f"{i:05d}.part"
            expected = end - start + 1
            if completed.is_file() and completed.stat().st_size == expected:
                total += expected
            elif partial.is_file():
                total += min(partial.stat().st_size, expected)
        return total

    pending = [(i, start, end) for i, start, end in chunks
               if not ((directory / f"{i:05d}.chunk").is_file()
                       and (directory / f"{i:05d}.chunk").stat().st_size == end - start + 1)]
    print(f"{name}: {size / 1e9:.2f} GB in {count} restart-safe chunks; "
          f"{len(pending)} chunks remain.", flush=True)
    executor = ThreadPoolExecutor(max_workers=WORKERS)
    remaining = iter(pending)
    futures = set()
    try:
        for _ in range(WORKERS):
            item = next(remaining, None)
            if item is not None:
                futures.add(executor.submit(download_chunk, url, directory, *item))
        while futures:
            finished, _ = wait(futures, timeout=5, return_when=FIRST_COMPLETED)
            done = transferred()
            print(f"\r{name}: {done / 1e9:.2f}/{size / 1e9:.2f} GB "
                  f"({100 * done / size:.1f}%)", end="", flush=True)
            for future in finished:
                future.result()
                futures.remove(future)
                item = next(remaining, None)
                if item is not None:
                    futures.add(executor.submit(download_chunk, url, directory, *item))
    finally:
        for future in futures:
            future.cancel()
        executor.shutdown(wait=True, cancel_futures=True)
    print(flush=True)

    assembled = target.with_suffix(target.suffix + ".assembling")
    digest_state = hashlib.sha256()
    with assembled.open("wb") as destination:
        for i, _, _ in chunks:
            with (directory / f"{i:05d}.chunk").open("rb") as source:
                for block in iter(lambda: source.read(8 * 1024 * 1024), b""):
                    destination.write(block)
                    digest_state.update(block)
    if assembled.stat().st_size != size or digest_state.hexdigest() != digest:
        assembled.unlink(missing_ok=True)
        for i, _, _ in chunks:
            (directory / f"{i:05d}.chunk").unlink(missing_ok=True)
        directory.rmdir()
        raise RuntimeError(f"SHA256 verification failed for {name}; cleared chunks so a rerun can retry.")
    assembled.replace(target)
    for i, _, _ in chunks:
        (directory / f"{i:05d}.chunk").unlink()
    directory.rmdir()
    print(f"Verified SHA256 for {name}.", flush=True)


def main() -> None:
    api = HfApi()
    image = api.model_info(IMAGE_REPO)
    video = api.model_info(VIDEO_REPO, files_metadata=True)
    revision = video.sha
    metadata = {item.rfilename: item for item in video.siblings}
    missing = set(VIDEO_FILES) - metadata.keys()
    if missing:
        raise RuntimeError(f"LTX repository is missing required files: {', '.join(sorted(missing))}")
    hf_hub_download(IMAGE_REPO, "v1-5-pruned-emaonly.safetensors", revision=image.sha,
                    local_dir="storage/tools/ComfyUI/models/checkpoints")

    small_files = [name for name in VIDEO_FILES if name != TRANSFORMER]
    cached = Path(snapshot_download(VIDEO_REPO, revision=revision,
                                    allow_patterns=small_files, max_workers=2))
    model_dir = Path("storage/models/ltx-motion") / revision
    model_dir.mkdir(parents=True, exist_ok=True)
    for name in small_files:
        source = cached / name
        if not source.is_file():
            raise RuntimeError(f"LTX snapshot is missing {name}")
        target = model_dir / name
        if target.is_symlink() or target.is_file():
            target.unlink()
        target.symlink_to(source.resolve())

    weight = metadata[TRANSFORMER]
    if weight.lfs is None:
        raise RuntimeError(f"No SHA256 metadata for {TRANSFORMER}")
    download_resumable(VIDEO_REPO, revision, TRANSFORMER, weight.lfs.size,
                       weight.lfs.sha256, model_dir / TRANSFORMER)
    Path("storage/setup/ltx-model-dir.txt").write_text(str(model_dir.resolve()) + "\n")
    Path("storage/setup/model-revisions.json").write_text(json.dumps({
        IMAGE_REPO: image.sha, VIDEO_REPO: revision,
    }, indent=2) + "\n")
    print(f"Mac motion model ready: {model_dir}", flush=True)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nDownload interrupted. Completed chunks will be reused on rerun.", file=sys.stderr)
        sys.exit(130)
