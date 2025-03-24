import * as THREE from 'three';

export const mountConfigs = [
{
  id: 'leftArm',
  boneName: 'ArmL',
  displayName: 'Left Arm',
  defaultPosition: new THREE.Vector3(-0.5, -2.47, 0), // Made symmetric to rightArm position
  defaultRotation: new THREE.Euler(0, 0, 0),
  defaultScale: 1.0,
  side: 'left',
  controlKey: 'mouse0', // Left mouse button
  mountType: 'primary' // Primary weapon
},
{
  id: 'rightArm',
  boneName: 'ArmR',
  displayName: 'Right Arm',
  defaultPosition: new THREE.Vector3(0.5, -2.47, 0), // Made symmetric to leftArm position
  defaultRotation: new THREE.Euler(0, 0, 0),
  defaultScale: 1,
  side: 'right',
  controlKey: 'mouse0', // Left mouse button (both arms use same control)
  mountType: 'primary' // Primary weapon
},
  {
    id: 'leftShoulder',
    boneName: 'ShoulderL',
    displayName: 'Left Shoulder',
    defaultPosition: new THREE.Vector3(-1, -2.47, 0),
    defaultRotation: new THREE.Euler(0, 0, 0),
    defaultScale: 1,
    side: 'left',
    controlKey: 'keyR', // R key
    mountType: 'secondary' // Secondary weapon
  },
  {
    id: 'rightShoulder',
    boneName: 'ShoulderR',
    displayName: 'Right Shoulder',
    defaultPosition: new THREE.Vector3(0, -0.3, 0),
    defaultRotation: new THREE.Euler(0, 0, 0),
    defaultScale: 1,
    side: 'right',
    controlKey: 'keyR', // R key (both shoulders use same control)
    mountType: 'secondary' // Secondary weapon
  }
];
