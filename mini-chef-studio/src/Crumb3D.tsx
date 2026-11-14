import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import {ThreeCanvas} from '@remotion/three';
import * as THREE from 'three';
import {poseAt, Pose} from './Crumb';

/**
 * Crumb 3D (spike): same pose data as the 2D rig (poseAt), drawn with simple lit solids on a transparent canvas.
 * Orthographic camera in canvas pixels, so pose.x / pose.y / pose.scale mean what they mean in 2D.
 * Local space: feet at y=0, y up (2D y is down, so 2D rotations are negated).
 */
const SKIN = '#E7B96A', APRON = '#FFFFFF', GOLD = '#D4AF37', INK = '#2A1A0E';
const rad = (deg: number) => (-deg * Math.PI) / 180;

const Mat: React.FC<{color: string; rough?: number}> = ({color, rough = 0.55}) => <meshStandardMaterial color={color} roughness={rough} metalness={0.02} />;

const Limb: React.FC<{pos: [number, number, number]; angle: number; len: number; r: number; handR?: number; foot?: boolean}> = ({pos, angle, len, r, handR, foot}) => (
  <group position={pos} rotation={[0, 0, rad(angle)]}>
    <mesh position={[0, -len / 2, 0]}><capsuleGeometry args={[r, len - r * 2, 8, 16]} /><Mat color={SKIN} /></mesh>
    {handR ? <mesh position={[0, -len - 4, 0]}><sphereGeometry args={[handR, 20, 16]} /><Mat color={SKIN} /></mesh> : null}
    {foot ? <mesh position={[5, -len - 2, 8]} scale={[1.7, 0.7, 2.1]}><sphereGeometry args={[12, 16, 12]} /><Mat color="#1B1B1B" rough={0.4} /></mesh> : null}
  </group>
);

const Body: React.FC<{pose: Pose}> = ({pose}) => {
  const open = pose.mouth === 'open' || pose.mouth === 'grin';
  return (
    <group position={[0, pose.bob, 0]} rotation={[0, 0, rad(pose.lean)]}>
      <Limb pos={[-26, 60, 0]} angle={pose.legL} len={52} r={11} foot />
      <Limb pos={[26, 60, 0]} angle={pose.legR} len={52} r={11} foot />
      <Limb pos={[-58, 155, 0]} angle={-pose.armL} len={72} r={10} handR={14} />
      <mesh position={[0, 110, 0]} scale={[74, 86, 66]}><sphereGeometry args={[1, 40, 32]} /><Mat color={SKIN} /></mesh>
      <mesh position={[0, 92, 58]} scale={[56, 62, 14]}><sphereGeometry args={[1, 32, 24]} /><Mat color={APRON} rough={0.8} /></mesh>
      <mesh position={[0, 108, 72]}><sphereGeometry args={[6, 12, 10]} /><Mat color={GOLD} rough={0.25} /></mesh>
      <mesh position={[0, 78, 72]}><sphereGeometry args={[6, 12, 10]} /><Mat color={GOLD} rough={0.25} /></mesh>
      <Limb pos={[58, 155, 0]} angle={pose.armR} len={72} r={10} handR={14} />
      <group position={[0, 242, 0]} rotation={[0, 0, rad(pose.head)]}>
        <mesh scale={[74, 74, 68]}><sphereGeometry args={[1, 40, 32]} /><Mat color={SKIN} /></mesh>
        {[-26, 26].map((x) => (
          <group key={x} position={[x, 4, 62]}>
            <mesh scale={[13, 15 * pose.blink, 8]}><sphereGeometry args={[1, 20, 16]} /><meshStandardMaterial color="#fff" roughness={0.3} /></mesh>
            <mesh position={[2, -2, 7]} scale={[1, pose.blink, 1]}><sphereGeometry args={[6, 14, 12]} /><meshStandardMaterial color={INK} roughness={0.2} /></mesh>
          </group>
        ))}
        {open ? (
          <mesh position={[0, -26, 64]} scale={[1, 0.9, 0.4]}><sphereGeometry args={[pose.mouth === 'grin' ? 17 : 11, 20, 16]} /><meshStandardMaterial color="#7A2E22" roughness={0.5} /></mesh>
        ) : (
          <mesh position={[0, -18, 66]} rotation={[0, 0, Math.PI]}><torusGeometry args={[16, 2.6, 8, 24, Math.PI]} /><meshStandardMaterial color={INK} roughness={0.5} /></mesh>
        )}
        <mesh position={[0, 62, 0]}><cylinderGeometry args={[40, 44, 34, 28]} /><Mat color="#fff" rough={0.85} /></mesh>
        <mesh position={[0, 92, 0]} scale={[1, 0.8, 1]}><sphereGeometry args={[46, 28, 20]} /><Mat color="#fff" rough={0.85} /></mesh>
        <mesh position={[0, 50, 0]}><cylinderGeometry args={[45, 46, 13, 28]} /><Mat color={GOLD} rough={0.3} /></mesh>
      </group>
    </group>
  );
};

const Scene: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps, height} = useVideoConfig();
  const t = frame / fps;
  const pose = poseAt(t);
  pose.blink = (t * 1000) % 3200 < 140 ? 0.15 : 1;
  const s = pose.scale;
  return (
    <>
      <ambientLight intensity={0.9} color="#ffe2b8" />
      <directionalLight position={[-300, 500, 700]} intensity={2.4} color="#ffd9a0" />
      <directionalLight position={[400, 200, -300]} intensity={1.3} color="#ff9a4a" />
      <group position={[pose.x, height - pose.y, 0]} scale={[pose.flip ? -s : s, s, s]} visible={pose.visible > 0.02}>
        <mesh position={[0, 2, -10]} rotation={[-Math.PI / 2, 0, 0]} scale={[1.4, 0.5, 1]}>
          <circleGeometry args={[100, 32]} /><meshBasicMaterial color="#000" transparent opacity={0.38 * pose.visible} depthWrite={false} />
        </mesh>
        <Body pose={pose} />
      </group>
    </>
  );
};

export const Crumb3D: React.FC = () => {
  const {width, height} = useVideoConfig();
  return (
    <AbsoluteFill style={{background: 'transparent'}}>
      <ThreeCanvas
        width={width}
        height={height}
        orthographic
        camera={{position: [width / 2, height / 2, 1000], zoom: 1, near: 1, far: 3000}}
        gl={{alpha: true, antialias: true, preserveDrawingBuffer: true}}
        style={{background: 'transparent'}}
        onCreated={({gl, scene, camera}) => { camera.lookAt(width / 2, height / 2, 0); camera.updateProjectionMatrix(); gl.setClearColor(new THREE.Color(0, 0, 0), 0); scene.background = null; }}
      >
        <Scene />
      </ThreeCanvas>
    </AbsoluteFill>
  );
};
