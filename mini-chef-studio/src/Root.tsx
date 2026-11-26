import {Composition} from 'remotion';
import {RunawayTruffle} from './RunawayTruffle';
import {MyComposition} from './Composition';
import {Crumb} from './Crumb';
import {Crumb3D, CrumbPlate} from './Crumb3D';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <MyComposition />
      <Composition id="RunawayTruffle" component={RunawayTruffle} durationInFrames={24 * 12} fps={24} width={540} height={960} />
      <Composition id="RunawayTruffleStory" component={RunawayTruffle} durationInFrames={24 * 30} fps={24} width={720} height={1280} />
      <Composition id="Crumb" component={Crumb} durationInFrames={24 * 30} fps={24} width={720} height={1280} />
      <Composition id="Crumb3D" component={Crumb3D} durationInFrames={24 * 30} fps={24} width={720} height={1280} />
      <Composition id="CrumbPlate" component={CrumbPlate} durationInFrames={24 * 30} fps={24} width={720} height={1280} />
    </>
  );
};
