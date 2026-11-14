import {Composition} from 'remotion';
import {MyComposition} from './Composition';
import {Crumb} from './Crumb';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <MyComposition />
      <Composition id="Crumb" component={Crumb} durationInFrames={24 * 30} fps={24} width={720} height={1280} />
    </>
  );
};
