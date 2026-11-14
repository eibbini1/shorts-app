import {ThreeCanvas} from '@remotion/three';
import {Video} from '@remotion/media';
import {AbsoluteFill, Composition, interpolate, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';

type ChefProps = {durationSeconds: number};

const ChefFigure: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps;
  const bob = Math.sin(t * 4) * 0.035;
  const wave = Math.sin(t * 7) * 0.22;
  const point = t > 17 && t < 25 ? -0.75 : wave;
  const blink = t % 3.7 < 0.12 ? 0.12 : 1;
  const delighted = t > 24;
  return (
    <group position={[0, bob - 0.13, 0]} rotation={[0, -0.18 + Math.sin(t * 1.2) * 0.08, 0]}>
      <mesh position={[0, -0.58, 0]}><capsuleGeometry args={[0.48, 0.65, 8, 20]}/><meshStandardMaterial color="#f5eee1" roughness={0.78}/></mesh>
      <mesh position={[0, -0.62, 0.47]}><boxGeometry args={[0.47, 0.65, 0.035]}/><meshStandardMaterial color="#ffffff" roughness={0.9}/></mesh>
      <mesh position={[-0.29, -1.38, 0]}><capsuleGeometry args={[0.15, 0.35, 6, 12]}/><meshStandardMaterial color="#332b28"/></mesh>
      <mesh position={[0.29, -1.38, 0]}><capsuleGeometry args={[0.15, 0.35, 6, 12]}/><meshStandardMaterial color="#332b28"/></mesh>
      <group position={[-0.53, -0.25, 0]} rotation={[0, 0, 0.36 + wave * 0.4]}>
        <mesh position={[-0.18, -0.3, 0]}><capsuleGeometry args={[0.14, 0.42, 6, 12]}/><meshStandardMaterial color="#f5eee1"/></mesh>
        <mesh position={[-0.35, -0.6, 0]}><sphereGeometry args={[0.17, 16, 12]}/><meshStandardMaterial color="#b87554" roughness={0.85}/></mesh>
      </group>
      <group position={[0.53, -0.25, 0]} rotation={[0, 0, point]}>
        <mesh position={[0.18, -0.3, 0]}><capsuleGeometry args={[0.14, 0.42, 6, 12]}/><meshStandardMaterial color="#f5eee1"/></mesh>
        <mesh position={[0.35, -0.6, 0]}><sphereGeometry args={[0.17, 16, 12]}/><meshStandardMaterial color="#b87554" roughness={0.85}/></mesh>
      </group>
      <mesh position={[0, 0.40, 0]}><sphereGeometry args={[0.45, 24, 18]}/><meshStandardMaterial color="#bd7e5e" roughness={0.88}/></mesh>
      <mesh position={[-0.15, 0.47, 0.4]} scale={[1, blink, 1]}><sphereGeometry args={[0.058, 12, 8]}/><meshStandardMaterial color="#241b18"/></mesh>
      <mesh position={[0.15, 0.47, 0.4]} scale={[1, blink, 1]}><sphereGeometry args={[0.058, 12, 8]}/><meshStandardMaterial color="#241b18"/></mesh>
      <mesh position={[-0.15, 0.58, 0.4]} rotation={[0, 0, -0.12]}><boxGeometry args={[0.15, 0.018, 0.025]}/><meshStandardMaterial color="#4f3029"/></mesh>
      <mesh position={[0.15, 0.58, 0.4]} rotation={[0, 0, 0.12]}><boxGeometry args={[0.15, 0.018, 0.025]}/><meshStandardMaterial color="#4f3029"/></mesh>
      <mesh position={[-0.28, 0.30, 0.31]}><sphereGeometry args={[0.08, 12, 8]}/><meshStandardMaterial color="#d9907c" roughness={0.96}/></mesh>
      <mesh position={[0.28, 0.30, 0.31]}><sphereGeometry args={[0.08, 12, 8]}/><meshStandardMaterial color="#d9907c" roughness={0.96}/></mesh>
      <mesh position={[0, 0.24, 0.42]} rotation={[0, 0, Math.PI + Math.sin(t * 2) * 0.05]} scale={[delighted ? 1.3 : 1, delighted ? 1.3 : 1, 1]}><torusGeometry args={[0.1, 0.018, 8, 18, Math.PI]}/><meshStandardMaterial color="#663a35"/></mesh>
      <mesh position={[0, 0.91, 0]}><cylinderGeometry args={[0.38, 0.44, 0.28, 24]}/><meshStandardMaterial color="#fffaf0" roughness={0.82}/></mesh>
      <mesh position={[0, 1.22, 0]}><cylinderGeometry args={[0.45, 0.39, 0.52, 24]}/><meshStandardMaterial color="#fffaf0" roughness={0.82}/></mesh>
      <mesh position={[0, 1.51, 0]}><sphereGeometry args={[0.45, 24, 16]}/><meshStandardMaterial color="#fffaf0" roughness={0.82}/></mesh>
      <mesh position={[0, 0.67, 0.08]}><boxGeometry args={[0.31, 0.13, 0.48]}/><meshStandardMaterial color="#fffaf0"/></mesh>
      <mesh position={[-0.14, -0.33, 0.51]}><sphereGeometry args={[0.035, 10, 8]}/><meshStandardMaterial color="#b99046" metalness={0.7}/></mesh>
      <mesh position={[0.14, -0.33, 0.51]}><sphereGeometry args={[0.035, 10, 8]}/><meshStandardMaterial color="#b99046" metalness={0.7}/></mesh>
    </group>
  );
};

const MiniChefFood: React.FC<ChefProps> = ({durationSeconds}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const fade = interpolate(frame, [0, fps * 0.4, durationSeconds * fps - fps * 0.5, durationSeconds * fps], [0, 1, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return (
    <AbsoluteFill style={{backgroundColor: '#170f0b'}}>
      <Video src={staticFile('food.mp4')} objectFit="cover" style={{width: '100%', height: '100%'}}/>
      <div style={{position: 'absolute', left: 18, bottom: 92, width: 205, height: 300, opacity: fade, filter: 'drop-shadow(0 14px 11px rgba(0,0,0,.58))'}}>
        <ThreeCanvas width={205} height={300} camera={{position: [0, 0.05, 6], fov: 38}} gl={{alpha: true}} style={{width: 205, height: 300, backgroundColor: 'transparent'}}>
          <ambientLight intensity={1.7}/><directionalLight position={[-2, 4, 5]} intensity={2.7} color="#ffe5bf"/>
          <directionalLight position={[3, 1, -4]} intensity={1.2} color="#ddad70"/>
          <ChefFigure/>
        </ThreeCanvas>
      </div>
    </AbsoluteFill>
  );
};

export const MyComposition = () => (
  <Composition id="MiniChefFood" component={MiniChefFood} fps={30} width={720} height={1280}
    durationInFrames={900} defaultProps={{durationSeconds: 30}}
    calculateMetadata={({props}) => ({durationInFrames: Math.round(props.durationSeconds * 30)})}/>
);
