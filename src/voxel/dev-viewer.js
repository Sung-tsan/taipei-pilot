// @ts-check
// voxel 模型轉盤檢視器（開發工具）：/dev-viewer.html
import * as THREE from 'three';
import { buildVoxelGeometry, voxelMaterial } from './build.js';
import { t34cBody, t34cProp, t34cPropPos } from './models/t34c.js';

/** @type {Record<string, () => THREE.Object3D>} */
const MODELS = {
  'T-34C 教練機': () => {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(buildVoxelGeometry(t34cBody), voxelMaterial()));
    const prop = new THREE.Mesh(buildVoxelGeometry(t34cProp), voxelMaterial());
    prop.position.set(t34cPropPos.x, t34cPropPos.y, t34cPropPos.z);
    prop.name = 'prop';
    g.add(prop);
    return g;
  },
};

const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setPixelRatio(1);
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#2a3450');
scene.add(new THREE.HemisphereLight('#dceefa', '#5a6478', 1.0));
const sun = new THREE.DirectionalLight('#fff2dc', 1.3);
sun.position.set(3, 5, 2);
scene.add(sun);
const grid = new THREE.GridHelper(20, 20, 0x4a5578, 0x3a4666);
scene.add(grid);

const cam = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
cam.position.set(9, 6, 9);
cam.lookAt(0, 1, 0);

/** @type {THREE.Object3D|null} */
let current = null;
const select = /** @type {HTMLSelectElement} */ (document.getElementById('modelSelect'));
for (const name of Object.keys(MODELS)) {
  select.add(new Option(name, name));
}
function load() {
  if (current) scene.remove(current);
  current = MODELS[select.value]();
  scene.add(current);
}
select.addEventListener('change', load);
load();

renderer.setAnimationLoop(() => {
  if (current) {
    current.rotation.y += 0.008;
    const prop = current.getObjectByName('prop');
    if (prop) prop.rotation.z += 0.4;
  }
  renderer.render(scene, cam);
});
window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  cam.aspect = window.innerWidth / window.innerHeight;
  cam.updateProjectionMatrix();
});
