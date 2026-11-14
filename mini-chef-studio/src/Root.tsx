import {Composition} from 'remotion';
import {MyComposition} from './Composition';
import {Crumb} from './Crumb';
import {Crumb3D} from './Crumb3D';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <MyComposition />
      <Composition id="Crumb" component={Crumb} durationInFrames={24 * 30} fps={24} width={720} height={1280} />
      <Composition id="Crumb3D" component={Crumb3D} durationInFrames={24 * 30} fps={24} width={720} height={1280} />
    </>
  );
};
