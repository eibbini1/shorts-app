import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

const DURATION = 10;

function material(color, roughness = 0.8) {
  return new THREE.MeshStandardMaterial({ color, roughness });
}

function sphere(parent, color, position, scale, segments = 24) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(1, segments, Math.max(12, Math.floor(segments * 0.75))),
    material(color),
  );
  mesh.position.set(...position);
  mesh.scale.set(...scale);
  parent.add(mesh);
  return mesh;
}

function segment(parent, start, end, radius, color) {
  const direction = new THREE.Vector3().subVectors(end, start);
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, direction.length(), 12),
    material(color),
  );
  parent.add(mesh);
  const update = (from, to) => {
    direction.subVectors(to, from);
    mesh.position.copy(from).add(to).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());
    mesh.scale.y = direction.length() / (mesh.geometry.parameters.height || 1);
  };
  update(start, end);
  return { mesh, update };
}

function makePark(scene) {
  scene.background = new THREE.Color('#a9dcff');
  scene.add(new THREE.HemisphereLight(0xffffff, 0x6f9748, 2.2));

  const sun = new THREE.DirectionalLight(0xfff0ce, 2.8);
  sun.position.set(-3, 7, 5);
  scene.add(sun);

  const grass = new THREE.Mesh(new THREE.PlaneGeometry(24, 24), material('#75bd62'));
  grass.rotation.x = -Math.PI / 2;
  grass.position.y = -0.02;
  scene.add(grass);

  sphere(scene, '#8bcf73', [-5, -1.4, -4], [4, 1.5, 1.4], 20);
  sphere(scene, '#8bcf73', [5, -1.4, -4], [4, 1.5, 1.4], 20);

  for (const [x, z, size] of [[-3.1, -2.4, 1], [3.4, -2.8, 1.15]]) {
    const tree = new THREE.Group();
    tree.position.set(x, 0, z);
    tree.add(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 1.4, 10), material('#9a603a')));
    tree.children[0].position.y = 0.7;
    sphere(tree, '#399b58', [0, 1.8, 0], [0.85 * size, 1.0 * size, 0.7 * size]);
    sphere(tree, '#50ad61', [-0.42, 1.55, 0.12], [0.52 * size, 0.6 * size, 0.5 * size]);
    sphere(tree, '#50ad61', [0.42, 1.55, -0.05], [0.55 * size, 0.62 * size, 0.5 * size]);
    scene.add(tree);
  }

  const cloud = new THREE.Group();
  for (const [x, y, scale] of [[0, 0, 0.45], [0.45, 0.05, 0.58], [0.9, 0, 0.4]]) {
    sphere(cloud, '#ffffff', [x, y, 0], [scale, scale * 0.72, scale * 0.7], 18);
  }
  cloud.position.set(-2.5, 4.2, -3);
  scene.add(cloud);
  const secondCloud = cloud.clone();
  secondCloud.position.set(2.2, 4.8, -4);
  secondCloud.scale.setScalar(0.72);
  scene.add(secondCloud);

  for (const [x, z, color] of [
    [-1.7, 1.25, '#ffdb4a'], [1.35, 1.1, '#f787a3'], [2.0, -0.4, '#a98bff'],
  ]) {
    const flower = new THREE.Group();
    flower.position.set(x, 0, z);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.025, 0.42, 8), material('#398b4e'));
    stem.position.y = 0.21;
    flower.add(stem);
    for (let i = 0; i < 5; i++) {
      const angle = i * Math.PI * 2 / 5;
      sphere(flower, color, [Math.cos(angle) * 0.09, 0.49, Math.sin(angle) * 0.09], [0.075, 0.075, 0.075], 12);
    }
    sphere(flower, '#ffbf32', [0, 0.49, 0], [0.06, 0.06, 0.06], 12);
    scene.add(flower);
  }
}

function makeBaby(scene) {
  const baby = new THREE.Group();
  baby.position.set(-0.55, 0, 0);
  scene.add(baby);

  sphere(baby, '#398dd0', [0, 0.72, 0], [0.38, 0.48, 0.31]);
  sphere(baby, '#327fbd', [0, 0.39, 0], [0.36, 0.24, 0.3]);
  sphere(baby, '#ffd0aa', [0, 1.48, 0.03], [0.47, 0.45, 0.4], 32);
  sphere(baby, '#47372e', [0, 1.82, -0.005], [0.44, 0.17, 0.38]);
  sphere(baby, '#ffd0aa', [-0.45, 1.48, 0.02], [0.1, 0.13, 0.1], 16);
  sphere(baby, '#ffd0aa', [0.45, 1.48, 0.02], [0.1, 0.13, 0.1], 16);

  for (const x of [-0.16, 0.16]) {
    sphere(baby, '#33251f', [x, 1.56, 0.39], [0.045, 0.06, 0.035], 16);
    sphere(baby, '#f49b91', [x * 1.8, 1.39, 0.35], [0.09, 0.055, 0.035], 16);
  }
  sphere(baby, '#e58f77', [0, 1.45, 0.43], [0.055, 0.045, 0.04], 16);
  const smileCurve = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(-0.11, 1.34, 0.405),
    new THREE.Vector3(0, 1.28, 0.43),
    new THREE.Vector3(0.11, 1.34, 0.405),
  );
  const smile = new THREE.Mesh(
    new THREE.TubeGeometry(smileCurve, 16, 0.018, 8, false),
    material('#85453b'),
  );
  baby.add(smile);

  for (const z of [-0.19, 0.19]) {
    const legStart = new THREE.Vector3(0.04, 0.36, z);
    const legEnd = new THREE.Vector3(0.32, 0.16, z);
    segment(baby, legStart, legEnd, 0.13, '#327fbd');
    sphere(baby, '#fff0d6', [0.4, 0.1, z], [0.2, 0.11, 0.13], 16);
  }

  const shoulder = new THREE.Vector3(0.26, 1.04, 0.02);
  const hand = new THREE.Vector3(0.52, 0.73, 0.28);
  const arm = segment(baby, shoulder, hand, 0.11, '#398dd0');
  const handMesh = sphere(baby, '#ffd0aa', [hand.x, hand.y, hand.z], [0.11, 0.1, 0.1], 16);

  return { baby, arm, shoulder, handMesh, smile };
}

function makeBall(scene) {
  const ball = new THREE.Group();
  const colors = ['#ff4e59', '#ffcf3f', '#35c985', '#408cff', '#a765ed', '#ff8b38'];
  for (let i = 0; i < colors.length; i++) {
    const geometry = new THREE.SphereGeometry(0.36, 24, 18, i * Math.PI / 3, Math.PI / 3);
    ball.add(new THREE.Mesh(geometry, material(colors[i], 0.38)));
  }
  ball.position.set(-0.13, 0.36, 0.08);
  scene.add(ball);
  return ball;
}

export default function BabyBall3DPreview() {
  const containerRef = useRef(null);
  const playRef = useRef(false);
  const timeRef = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    let renderer;
    try {
      const canvas = container.querySelector('canvas');
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'low-power' });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
    } catch {
      setError('This browser cannot display the interactive 3D preview. Try a browser with WebGL enabled.');
      return undefined;
    }

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
    camera.position.set(0, 3.5, 8.5);
    camera.lookAt(0, 1.25, 0);
    makePark(scene);
    const { baby, arm, shoulder, handMesh, smile } = makeBaby(scene);
    const ball = makeBall(scene);
    const ballRadius = 0.36;
    const clock = new THREE.Clock();
    let lastUiUpdate = 0;
    let frameId;

    const resize = () => {
      const bounds = container.getBoundingClientRect();
      const width = Math.max(1, bounds.width);
      const height = Math.max(1, bounds.height);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();

    const animate = () => {
      const now = performance.now();
      if (playRef.current) {
        timeRef.current = Math.min(DURATION, timeRef.current + Math.min(clock.getDelta(), 0.05));
        if (timeRef.current >= DURATION) {
          playRef.current = false;
          setPlaying(false);
          setTime(DURATION);
        }
        if (now - lastUiUpdate > 120) {
          lastUiUpdate = now;
          setTime(timeRef.current);
        }
      } else {
        clock.getDelta();
      }

      const t = timeRef.current;
      const travel = THREE.MathUtils.smoothstep(t, 0.45, 4.7);
      ball.position.x = THREE.MathUtils.lerp(-0.13, 0.38, travel);
      ball.rotation.z = -travel * 0.51 / ballRadius;
      const bounce = t < 4.8 ? Math.abs(Math.sin(t * 7)) * (1 - travel) * 0.12 : 0;
      ball.position.y = ballRadius + bounce;
      baby.rotation.z = Math.sin(t * 4.2) * 0.018;
      const reach = 0.12 * Math.sin(Math.min(1, t / 1.4) * Math.PI);
      const hand = new THREE.Vector3(0.52 + reach, 0.73 + reach * 0.6, 0.28);
      arm.update(shoulder, hand);
      handMesh.position.copy(hand);
      smile.scale.y = t > 5 ? 1 + Math.max(0, Math.sin(t * 6)) * 0.35 : 1;
      camera.position.x = THREE.MathUtils.lerp(0.15, -0.05, THREE.MathUtils.smoothstep(t, 4.2, 5.6));
      camera.position.z = THREE.MathUtils.lerp(8.1, 8.8, THREE.MathUtils.smoothstep(t, 4.2, 5.6));
      camera.lookAt(0, 1.22, 0);
      renderer.render(scene, camera);
      frameId = requestAnimationFrame(animate);
    };
    frameId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(frameId);
      observer.disconnect();
      scene.traverse((object) => {
        if (object.geometry) object.geometry.dispose();
        if (object.material) {
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((item) => item.dispose());
        }
      });
      renderer.dispose();
    };
  }, []);

  const togglePlayback = () => {
    if (timeRef.current >= DURATION) {
      timeRef.current = 0;
      setTime(0);
    }
    playRef.current = !playRef.current;
    setPlaying(playRef.current);
  };
  const seek = (value) => {
    const next = Number(value);
    playRef.current = false;
    timeRef.current = next;
    setPlaying(false);
    setTime(next);
  };

  return (
    <div className="baby3d-preview">
      {error
        ? <p className="muted" role="status">{error}</p>
        : <div className="baby3d-canvas" ref={containerRef}><canvas aria-label="Interactive 3D preview of a baby playing with a colorful ball in a park" /></div>}
      {!error && <div className="baby3d-controls">
        <button type="button" className="ghost" onClick={togglePlayback}>{playing ? 'Pause' : time >= DURATION ? 'Play again' : 'Play'}</button>
        <span className="muted small" aria-live="polite">{time < 5 ? 'Shot 1 · the baby rolls the ball' : 'Shot 2 · the ball settles near the baby'}</span>
        <label className="baby3d-scrub">
          <span className="sr-only">Preview time</span>
          <input type="range" min="0" max={DURATION} step="0.1" value={time} onChange={(event) => seek(event.target.value)} />
        </label>
        <span className="muted small">{time.toFixed(1)}s / {DURATION}s</span>
      </div>}
    </div>
  );
}
