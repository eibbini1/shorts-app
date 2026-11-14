import React, {useMemo} from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import {ThreeCanvas} from '@remotion/three';
import * as THREE from 'three';
import {poseAt, Pose} from './Crumb';
import {platePose} from './plates/juuni-ban';

/**
 * Crumb 3D: same pose data as the 2D rig (poseAt), drawn as toon-shaded solids with ink outlines on a transparent canvas.
 * Orthographic camera in canvas pixels, so pose.x / pose.y / pose.scale mean what they mean in 2D.
 * Local space: feet at y=0, y up (2D y is down, so 2D rotations are negated).
 */
const SKIN = '#E0A27A', WHITE = '#F7F4EE', GOLD = '#D4AF37', INK = '#2A1A0E', LINE = '#3d2412', APRON = '#34343d', PANTS = '#5a6786', HAIR = '#e6e3dc';
const rad = (deg: number) => (-deg * Math.PI) / 180;
type V3 = [number, number, number];

const useToon = () => useMemo(() => {
  const data = new Uint8Array([95, 155, 215, 255]);
  const tex = new THREE.DataTexture(data, 4, 1, THREE.RedFormat);
  tex.minFilter = tex.magFilter = THREE.NearestFilter; tex.needsUpdate = true;
  return tex;
}, []);
const ToonCtx = React.createContext<THREE.Texture | null>(null);

/** A solid with a slightly inflated back-face shell as the ink outline. */
const Part: React.FC<{color: string; position?: V3; scale?: V3; rotation?: V3; outline?: number; children: React.ReactNode}> = ({color, position, scale = [1, 1, 1], rotation, outline = 1.07, children}) => {
  const ramp = React.useContext(ToonCtx);
  return (
    <group position={position} rotation={rotation}>
      <mesh scale={scale}>{children}<meshToonMaterial color={color} gradientMap={ramp ?? undefined} /></mesh>
      <mesh scale={[scale[0] * outline, scale[1] * outline, scale[2] * outline]}>{children}<meshBasicMaterial color={LINE} side={THREE.BackSide} /></mesh>
    </group>
  );
};

const Leg: React.FC<{x: number; angle: number}> = ({x, angle}) => (
  <group position={[x, 108, 0]} rotation={[0, 0, rad(angle)]}>
    <Part color={PANTS} position={[0, -43, 0]} outline={1.12}><capsuleGeometry args={[14, 62, 8, 16]} /></Part>
    <Part color="#161616" position={[4, -90, 12]} scale={[1.05, 0.55, 1.9]} outline={1.1}><sphereGeometry args={[14, 16, 12]} /></Part>
  </group>
);

const Arm: React.FC<{side: 1 | -1; angle: number}> = ({side, angle}) => (
  <group position={[side * 54, 246, 0]} rotation={[0, 0, rad(angle * side)]}>
    <Part color={WHITE} position={[0, -34, 0]} outline={1.14}><capsuleGeometry args={[12, 46, 8, 16]} /></Part>
    <Part color={GOLD} position={[0, -68, 0]} outline={1.1}><cylinderGeometry args={[12.5, 12.5, 7, 16]} /></Part>
    <Part color={SKIN} position={[0, -82, 0]} outline={1.12}><sphereGeometry args={[11, 20, 16]} /></Part>
    {side === 1 ? (
      <group position={[0, -84, 10]} rotation={[0.3, 0, 0]}>
        <Part color={GOLD} position={[0, -12, 0]} outline={1.2}><cylinderGeometry args={[2.6, 2.6, 26, 10]} /></Part>
        {[0, 1.05, 2.1].map((r) => (<mesh key={r} position={[0, -42, 0]} rotation={[0, r, 0]} scale={[0.55, 1.5, 1]}><torusGeometry args={[11, 1.2, 6, 24]} /><meshToonMaterial color="#f0cf5a" /></mesh>))}
      </group>
    ) : null}
    <Part color={SKIN} position={[side * 9, -80, 7]} scale={[0.7, 1.2, 0.7]} outline={1.12}><sphereGeometry args={[5, 12, 10]} /></Part>
  </group>
);

const Face: React.FC<{pose: Pose}> = ({pose}) => {
  const open = pose.mouth === 'open' || pose.mouth === 'grin';
  const big = pose.mouth === 'grin' ? 13 : 9;
  return (
    <group>
      {[-14, 14].map((x) => (
        <group key={x} position={[x, 6, 29]}>
          <mesh scale={[8.5, 9.5 * pose.blink, 4]}><sphereGeometry args={[1, 20, 16]} /><meshBasicMaterial color="#fff" /></mesh>
          <mesh position={[x < 0 ? 1.2 : -1.2, -0.5, 3.6]} scale={[1, pose.blink, 1]}><sphereGeometry args={[4.6, 14, 12]} /><meshBasicMaterial color="#3a2210" /></mesh>
          <mesh position={[x < 0 ? 2.4 : -0.2, 1.6, 6.8]} scale={[1, pose.blink, 1]}><sphereGeometry args={[1.5, 8, 6]} /><meshBasicMaterial color="#fff" /></mesh>
          <mesh position={[0, 13, 2]} rotation={[0, 0, x < 0 ? 0.16 : -0.16]}><boxGeometry args={[17, 4.5, 3.5]} /><meshBasicMaterial color={HAIR} /></mesh>
        </group>
      ))}
      <mesh position={[14, 6, 33]}><torusGeometry args={[11.5, 1.7, 8, 28]} /><meshToonMaterial color={GOLD} /></mesh>
      <mesh position={[22, -12, 33]} rotation={[0, 0, -0.35]}><boxGeometry args={[1, 26, 1]} /><meshBasicMaterial color={GOLD} /></mesh>
      <Part color={SKIN} position={[0, -5, 33]} scale={[1, 1.1, 1]} outline={1.12}><sphereGeometry args={[5, 14, 12]} /></Part>
      {[-1, 1].map((sd) => (<group key={'w' + sd}>
        <mesh position={[sd * 22, 3, 24]} rotation={[0, 0, sd * 0.5]}><boxGeometry args={[7, 1.3, 1.3]} /><meshBasicMaterial color="#b9774f" /></mesh>
        <mesh position={[sd * 22, 0, 24]} rotation={[0, 0, sd * -0.1]}><boxGeometry args={[7, 1.3, 1.3]} /><meshBasicMaterial color="#b9774f" /></mesh>
        <mesh position={[sd * 12, -10, 31]} rotation={[0, 0, sd * -0.7]}><boxGeometry args={[9, 1.4, 1.4]} /><meshBasicMaterial color="#b9774f" /></mesh>
      </group>))}
      {[-24, 24].map((x) => (<mesh key={x} position={[x, -8, 25]} scale={[1, 0.6, 0.3]}><sphereGeometry args={[7, 14, 10]} /><meshBasicMaterial color="#e87b66" transparent opacity={0.45} /></mesh>))}
      {[-1, 1].map((sd) => (<mesh key={sd} position={[sd * 7.5, -13, 33]} rotation={[0, 0, sd * -0.25]} scale={[1.1, 0.55, 0.7]}><capsuleGeometry args={[7, 11, 6, 12]} /><meshBasicMaterial color={HAIR} /></mesh>))}
      {open ? (
        <group position={[0, -22, 31]}>
          <mesh scale={[1, pose.mouth === 'grin' ? 0.8 : 1, 0.35]}><sphereGeometry args={[big, 22, 16]} /><meshBasicMaterial color="#6e2519" /></mesh>
          <mesh position={[0, big * 0.4, 3.5]} scale={[0.85, 0.28, 0.2]}><sphereGeometry args={[big, 16, 10]} /><meshBasicMaterial color="#fff" /></mesh>
        </group>
      ) : pose.mouth === 'flat' ? (
        <mesh position={[0, -21, 33]}><boxGeometry args={[16, 2.6, 2.6]} /><meshBasicMaterial color={INK} /></mesh>
      ) : (
        <mesh position={[0, -17, 33]} rotation={[0, 0, Math.PI]}><torusGeometry args={[10, 1.9, 8, 24, Math.PI]} /><meshBasicMaterial color={INK} /></mesh>
      )}
    </group>
  );
};

const Body: React.FC<{pose: Pose; t: number}> = ({pose, t}) => (
  <group position={[0, pose.bob, 0]} rotation={[0, 0, rad(pose.lean)]}>
    <Leg x={-18} angle={pose.legL} />
    <Leg x={18} angle={pose.legR} />
    <group position={[0, -24, 0]}>
    <Arm side={-1} angle={pose.armL} />
    {/* chef jacket, apron, buttons, neckerchief */}
    <Part color={WHITE} position={[0, 192, 0]} scale={[48, 66, 32]}><sphereGeometry args={[1, 40, 32]} /></Part>
    <Part color={APRON} position={[0, 150, 29]} scale={[32, 30, 4]} outline={1.06}><sphereGeometry args={[1, 32, 24]} /></Part>
    {[222, 204].map((y) => (<mesh key={y} position={[-9, y, 32]}><sphereGeometry args={[3.6, 10, 8]} /><meshToonMaterial color={GOLD} /></mesh>))}
    {[222, 204].map((y) => (<mesh key={y + 1} position={[9, y, 32]}><sphereGeometry args={[3.6, 10, 8]} /><meshToonMaterial color={GOLD} /></mesh>))}
    <Part color="#a31f2e" position={[0, 252, 4]} rotation={[Math.PI / 2, 0, 0]} outline={1.1}><torusGeometry args={[15, 5, 10, 24]} /></Part>
    <mesh position={[0, 236, 8]} rotation={[1.25, 0, 0]}><torusGeometry args={[24, 1.9, 8, 32]} /><meshToonMaterial color={GOLD} /></mesh>
    <Part color={GOLD} position={[0, 210, 33]} rotation={[Math.PI / 2, 0, 0]} outline={1.12}><cylinderGeometry args={[8, 8, 3, 20]} /></Part>
    <Arm side={1} angle={pose.armR} />
    {/* neck + head */}
    <Part color={SKIN} position={[0, 262, 0]} outline={1.1}><cylinderGeometry args={[10, 11, 14, 16]} /></Part>
    <group position={[0, 298, 0]} rotation={[0, 0, rad(pose.head)]}>
      <group scale={[1.12, 1.12, 1.12]}>
      <Part color={SKIN} scale={[36, 41, 34]}><sphereGeometry args={[1, 40, 32]} /></Part>
      {[-1, 1].map((sd) => (<Part key={sd} color={SKIN} position={[sd * 35, -2, 0]} scale={[1, 1.3, 0.8]} outline={1.12}><sphereGeometry args={[6, 12, 10]} /></Part>))}
      <Part color={HAIR} position={[0, 18, -6]} scale={[37.5, 26, 32]} outline={1.03}><sphereGeometry args={[1, 28, 20]} /></Part>
      <Face pose={pose} />
      </group>
      {/* big toque */}
      <Part color={WHITE} position={[0, 46, 0]} outline={1.05}><cylinderGeometry args={[36, 40, 30, 32]} /></Part>
      <Part color={WHITE} position={[0, 88, 0]} scale={[1.2, 0.95, 1.2]} outline={1.04}><sphereGeometry args={[38, 32, 22]} /></Part>
      {[-1, 1].map((sd) => (<Part key={sd} color={WHITE} position={[sd * 26, 98, 0]} scale={[1, 0.8, 1]} outline={1.04}><sphereGeometry args={[24, 22, 16]} /></Part>))}
      <Part color={WHITE} position={[0, 112, 4]} scale={[1.1, 0.8, 1.1]} outline={1.04}><sphereGeometry args={[26, 22, 16]} /></Part>
      <Part color={GOLD} position={[0, 36, 0]} outline={1.04}><cylinderGeometry args={[40.5, 41, 7, 32]} /></Part>
      {[[-52, 40, 40], [58, 70, 30], [-40, 118, 20], [46, 126, 10]].map(([x, y, z], i) => (
        <mesh key={i} position={[x, y, z]} rotation={[0, t * 2 + i, Math.PI / 4]} scale={Math.max(0.05, 0.55 + 0.45 * Math.sin(t * 6 + i * 1.7))}>
          <octahedronGeometry args={[7, 0]} /><meshBasicMaterial color="#fff3b0" />
        </mesh>
      ))}
    </group>
  </group>
    </group>
);

const Scene: React.FC<{plate?: boolean}> = ({plate}) => {
  const frame = useCurrentFrame();
  const {fps, height} = useVideoConfig();
  const t = frame / fps;
  const pose = plate ? platePose(t) : poseAt(t);
  pose.blink = (t * 1000) % 3200 < 140 ? 0.15 : 1;
  pose.lean += 3; // slight elder's stoop
  const s = plate ? pose.scale : pose.scale * 1.7;
  return (
    <>
      <ambientLight intensity={1.5} color="#ffe2b8" />
      <directionalLight position={[-300, 500, 700]} intensity={2.2} color="#ffd9a0" />
      <directionalLight position={[500, 250, -200]} intensity={3.2} color="#ffc070" />
      <directionalLight position={[-500, 300, -200]} intensity={2.2} color="#ffe0a0" />
      <group position={[pose.x, height - pose.y, 0]} scale={[pose.flip ? -s : s, s, s]} visible={pose.visible > 0.02}>
        {[1.5, 1.15, 0.8].map((k, i) => (
          <mesh key={k} position={[0, 2, -10]} rotation={[-Math.PI / 2, 0, 0]} scale={[k, k * 0.36, 1]}>
            <circleGeometry args={[100, 32]} /><meshBasicMaterial color="#000" transparent opacity={0.14 * pose.visible} depthWrite={false} />
          </mesh>
        ))}
        <Body pose={pose} t={t} />
      </group>
    </>
  );
};

export const Crumb3D: React.FC<{plate?: boolean}> = ({plate}) => {
  const {width, height} = useVideoConfig();
  const ramp = useToon();
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
        <ToonCtx.Provider value={ramp}><Scene plate={plate} /></ToonCtx.Provider>
      </ThreeCanvas>
    </AbsoluteFill>
  );
};

export const CrumbPlate: React.FC = () => <Crumb3D plate />;
