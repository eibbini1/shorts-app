import {ThreeCanvas} from '@remotion/three';
import {AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';

const speckles = Array.from({length: 76}, (_, index) => {
  const y = 1 - 2 * (index + 0.5) / 76;
  const radius = Math.sqrt(1 - y * y);
  const angle = index * 2.399963;
  return [radius * Math.sin(angle) * 0.497, y * 0.497, radius * Math.cos(angle) * 0.497] as const;
});

export const RunawayTruffle = () => {
  const frame = useCurrentFrame();
  const {width, height, fps, durationInFrames} = useVideoConfig();
  const seconds = frame / fps;
  const episode = durationInFrames / fps === 30;
  const t = episode
    ? interpolate(seconds, [0, 2, 5, 8, 14, 18, 19.8, 22, 24, 28, 30],
      [0, 0.6, 1.2, 2.15, 3.05, 3.7, 4.45, 5.25, 7, 10.6, 12])
    : seconds;
  const at = (times: number[], values: number[]) =>
    interpolate(t, times, values, {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.quad)});
  const x = at([0, 1.2, 3.7, 4.45, 5.25, 6.1], [-0.56, -0.56, 0.82, 0.66, 0.76, 0.70]);
  const tilt = at([0, 0.5, 1.6, 4.3, 6], [0, 0, -0.16, -0.10, 0]);
  const squash = at([3.5, 3.85, 4.35, 4.66, 5.25], [1, 0.82, 1.12, 0.94, 1]);
  const eyes = at([0, 0.24, 0.6, 3.8, 4.15, 5, 7.58, 7.68, 7.80],
    [0.09, 0.09, 1.26, 1.26, 0.7, 1, 1, 0.08, 1]);
  const speaking = episode && [[0.42, 3.8], [10.4, 13.2], [23.7, 26.65]]
    .some(([start, end]) => seconds >= start && seconds < end);
  const speech = speaking ? Math.abs(Math.sin(seconds * 15)) : !episode && t > 9.06 && t < 10.58 ? Math.abs(Math.sin((t - 9.06) * 15)) : 0;
  const mouth = at([0, 0.8, 1.4, 3.8, 4.45, 7.0], [0.24, 0.24, 1.25, 1.35, 0.24, 0.38]);
  return (
    <AbsoluteFill style={{background: 'radial-gradient(ellipse at 23% 24%, #ffd09a 0%, #b76e4d 34%, #532e2c 73%, #2b1822 100%)'}}>
      <ThreeCanvas width={width} height={height} camera={{position: [0, 3.1, 7.1], fov: 41}}
        onCreated={({camera}) => camera.lookAt(0, 0.45, 0)}>
        <hemisphereLight color="#fff1d2" groundColor="#793331" intensity={1.7} />
        <directionalLight position={[-4, 6, 3]} color="#ffe0ae" intensity={3.0} />
        <directionalLight position={[3, 3, -3]} color="#ffac70" intensity={1.6} />
        <mesh position={[0, -0.32, 0]}>
          <boxGeometry args={[6, 0.38, 5.8]} />
          <meshStandardMaterial color="#843d29" roughness={0.9} />
        </mesh>
        {[-1.9, -1.15, 1.15, 1.9].map((offset) => (
          <mesh key={offset} position={[offset, -0.127, 0]}>
            <boxGeometry args={[0.018, 0.008, 5.8]} /><meshStandardMaterial color="#622b22" />
          </mesh>
        ))}
        <group position={[0, 0.17, 0]} rotation={[0, 0, tilt]}>
          <mesh scale={[1, 0.48, 1]}>
            <cylinderGeometry args={[1.58, 1.49, 0.34, 72]} />
            <meshStandardMaterial color="#ffd9ae" roughness={0.31} />
          </mesh>
          <mesh position={[0, 0.091, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[1, 1, 0.62]}>
            <torusGeometry args={[1.47, 0.082, 14, 72]} />
            <meshStandardMaterial color="#f49c70" roughness={0.37} />
          </mesh>
          <mesh position={[x, 0.088, 0.14]} rotation={[-Math.PI / 2, 0, 0]} scale={[1.18, 0.7, 1]}>
            <circleGeometry args={[0.43, 36]} />
            <meshBasicMaterial color="#8c4d34" transparent opacity={0.28} depthWrite={false} />
          </mesh>
          <group position={[x, 0.086 + 0.5 * squash, 0.1]} rotation={[0.10, -0.08 + (episode ? 0.10 * Math.sin(seconds * 1.55) : 0), at([1.2, 3.7, 4.45, 5.25, 6.1], [0, -0.5, 0.24, -0.12, 0])]}
            scale={[1 + (1 - squash) * 0.5, squash, 1]}>
            <mesh><sphereGeometry args={[0.5, 48, 32]} /><meshStandardMaterial color="#803820" roughness={0.95} /></mesh>
            {speckles.map(([px, py, pz], index) => (
              <mesh key={index} position={[px, py, pz]}>
                <sphereGeometry args={[index % 3 === 0 ? 0.016 : 0.010, 6, 5]} />
                <meshStandardMaterial color={index % 2 ? '#b86635' : '#612817'} roughness={1} />
              </mesh>
            ))}
            {[-1, 1].map((side) => (
              <group key={side} position={[side * 0.158, 0.098, 0.457]}>
                <group scale={[1, eyes, 1]}>
                  <mesh scale={[0.109, 0.132, 0.042]}><sphereGeometry /><meshStandardMaterial color="#fff0ce" /></mesh>
                  <mesh position={[at([0.5, 1.2, 4, 7], [0, 0.044, 0.044, 0]), 0, 0.032]} scale={[0.052, 0.073, 0.03]}>
                    <sphereGeometry /><meshStandardMaterial color="#26121d" />
                  </mesh>
                  <mesh position={[0.014, 0.022, 0.060]} scale={[0.017, 0.018, 0.008]}><sphereGeometry /><meshBasicMaterial color="#fff9da" /></mesh>
                </group>
                <mesh position={[0, 0.161 + (eyes - 1) * 0.032, -0.011]} rotation={[0, 0, side * (eyes > 1.1 ? -0.25 : 0.12)]}
                  scale={[0.083, 0.022, 0.025]}><sphereGeometry /><meshStandardMaterial color="#4b1c14" /></mesh>
              </group>
            ))}
            <mesh position={[0, -0.103, 0.489]} scale={[0.082 + speech * 0.017, 0.062 * mouth + speech * 0.061, 0.020]}>
              <sphereGeometry /><meshStandardMaterial color="#3b1418" />
            </mesh>
            {[-1, 1].map((side) => (
              <mesh key={side} position={[side * 0.251, -0.055, 0.423]} scale={[0.059, 0.032, 0.022]}>
                <sphereGeometry /><meshStandardMaterial color="#dc7951" roughness={0.95} />
              </mesh>
            ))}
          </group>
        </group>
      </ThreeCanvas>
    </AbsoluteFill>
  );
};
