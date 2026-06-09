import * as GaussianSplats3D from '@mkkellogg/gaussian-splats-3d';

const inferSceneFormat = (path) => {
  const lowerPath = String(path ?? '').toLowerCase();
  if (lowerPath.endsWith('.ply')) return GaussianSplats3D.SceneFormat.Ply;
  if (lowerPath.endsWith('/model')) return GaussianSplats3D.SceneFormat.Ply;
  if (lowerPath.endsWith('/model_editor_cut')) return GaussianSplats3D.SceneFormat.Ply;
  if (lowerPath.includes('/ply-file')) return GaussianSplats3D.SceneFormat.Ply;
  if (lowerPath.endsWith('.splat')) return GaussianSplats3D.SceneFormat.Splat;
  if (lowerPath.endsWith('.ksplat')) return GaussianSplats3D.SceneFormat.KSplat;
  return undefined;
};

export function createSplatRenderer({ renderer, camera }) {
  let viewer = null;
  let loaded = false;
  let loadingToken = 0;

  const ensureViewer = () => {
    if (viewer) return viewer;

    viewer = new GaussianSplats3D.Viewer({
      selfDrivenMode: false,
      renderer,
      camera,
      useBuiltInControls: false,
      ignoreDevicePixelRatio: false,
      gpuAcceleratedSort: false,
      enableSIMDInSort: true,
      sharedMemoryForWorkers: false,
      webXRMode: GaussianSplats3D.WebXRMode.None,
      renderMode: GaussianSplats3D.RenderMode.Always,
      sceneRevealMode: GaussianSplats3D.SceneRevealMode.Instant,
    });

    return viewer;
  };

  const unload = async () => {
    if (!viewer) return;
    loaded = false;

    const sceneCount = viewer.getSceneCount?.() ?? 0;
    if (sceneCount <= 0) return;

    try {
      await viewer.removeSplatScenes(
        Array.from({ length: sceneCount }, (_, index) => index),
        false,
      );
    } catch (error) {
      console.warn('Could not unload splat scene.', error);
    }
  };

  const loadSplatModel = async (path, options = {}) => {
    const currentToken = ++loadingToken;
    const activeViewer = ensureViewer();

    await unload();
    if (currentToken !== loadingToken) return;

    const format = inferSceneFormat(path);
    const sceneOptions = {
      splatAlphaRemovalThreshold: 5,
      showLoadingUI: false,
      progressiveLoad: true,
      ...options,
    };
    if (format !== undefined) sceneOptions.format = format;

    loaded = false;
    await activeViewer.addSplatScene(path, sceneOptions);
    if (currentToken === loadingToken) loaded = true;
  };

  const update = () => {
    if (viewer && loaded) viewer.update();
  };

  const render = () => {
    if (viewer && loaded) viewer.render();
  };

  const dispose = async () => {
    loadingToken += 1;
    loaded = false;
    if (!viewer) return;

    try {
      await viewer.dispose();
    } catch (error) {
      console.warn('Could not dispose splat viewer.', error);
    } finally {
      viewer = null;
    }
  };

  return {
    loadSplatModel,
    unload,
    update,
    render,
    dispose,
    isLoaded: () => loaded,
  };
}
