import * as THREE from 'three';
import { SceneManager } from './scene.js';

export const DebugTools = {
  boneVisualizers: [],

  visualizeBones(player) {
    // Remove existing visualizers
    if (this.boneVisualizers) {
      this.boneVisualizers.forEach(helper => {
        SceneManager.scene.remove(helper);
      });
    }
    
    this.boneVisualizers = [];
    
    const createBoneMarker = (bone, color = 0xff0000) => {
      const geometry = new THREE.SphereGeometry(0.1, 8, 8);
      const material = new THREE.MeshBasicMaterial({ color });
      const marker = new THREE.Mesh(geometry, material);
      
      const axesHelper = new THREE.AxesHelper(0.5);
      marker.add(axesHelper);
      
      bone.add(marker);
      
      this.boneVisualizers.push(marker);
      
      const worldPos = new THREE.Vector3();
      bone.getWorldPosition(worldPos);
      console.log(`Bone "${bone.name}" world position:`, worldPos);
      
      return marker;
    };
    
    // Visualize important bones
    const leftArm = this.findLeftArm(player);
    if (leftArm) {
      console.log('Visualizing left arm bone');
      createBoneMarker(leftArm, 0xff0000); // Red for left arm
      
      // Create markers for parent bones to see hierarchy
      let parent = leftArm.parent;
      let color = 0x00ff00; // Start with green
      
      while (parent && parent.name) {
        console.log(`Visualizing parent bone: ${parent.name}`);
        createBoneMarker(parent, color);
        parent = parent.parent;
        color = color === 0x00ff00 ? 0x0000ff : 0x00ff00; // Alternate colors
      }
    }
    
    this.logBoneStructure(player);
  },

  findLeftArm(player) {
    let leftArm = null;
    
    if (!player) {
      console.error('Player model not loaded');
      return null;
    }
    
    player.traverse((child) => {
      if (child.name === 'Arm.L' || 
          child.name === 'arm_L' || 
          child.name === 'ArmL' ||
          child.name === 'L_Arm' || 
          (child.name.toLowerCase().includes('arm') && 
           (child.name.includes('l') || child.name.includes('L')))) {
        
        if (!leftArm || child.name === 'Arm.L') {
          leftArm = child;
        }
      }
    });
    
    return leftArm;
  },

  logBoneStructure(player) {
    if (!player) {
      console.error('Player model not loaded');
      return;
    }
    
    console.log('=== FULL BONE STRUCTURE ===');
    const logNode = (node, depth = 0) => {
      const indent = '  '.repeat(depth);
      const localPos = node.position.toArray().map(n => n.toFixed(2));
      const worldPos = new THREE.Vector3();
      node.getWorldPosition(worldPos);
      const worldPosArr = worldPos.toArray().map(n => n.toFixed(2));
      
      console.log(`${indent}${node.name || 'unnamed'} - Local: [${localPos}], World: [${worldPosArr}]`);
      
      node.children.forEach(child => {
        logNode(child, depth + 1);
      });
    };
    
    player.children.forEach(child => {
      logNode(child);
    });
  },

  createTestObject(position = [0, 0, 0], color = 0xff00ff) {
    const geometry = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    const material = new THREE.MeshBasicMaterial({ color });
    const testCube = new THREE.Mesh(geometry, material);
    testCube.position.set(...position);
    SceneManager.scene.add(testCube);
    return testCube;
  },

  findBestWeaponPosition(player) {
    const leftArm = this.findLeftArm(player);
    
    if (!leftArm) {
      console.error('Left arm not found');
      return;
    }
    
    // Test different offsets and display them
    const offsets = [
      { name: "Zero", pos: [0, 0, 0], color: 0xff0000 },
      { name: "Forward", pos: [0, 0, 1], color: 0x00ff00 },
      { name: "Right", pos: [1, 0, 0], color: 0x0000ff },
      { name: "Up", pos: [0, 1, 0], color: 0xffff00 },
      { name: "Custom", pos: [0.5, -0.3, 0.7], color: 0xff00ff }
    ];
    
    this.testMarkers = [];
    offsets.forEach(offset => {
      // Create a marker at this offset from the arm
      const marker = new THREE.Mesh(
        new THREE.SphereGeometry(0.1, 8, 8),
        new THREE.MeshBasicMaterial({ color: offset.color })
      );
      
      // Add to the arm at the offset position
      leftArm.add(marker);
      marker.position.set(...offset.pos);
      
      // Add label
      const worldPos = new THREE.Vector3();
      marker.getWorldPosition(worldPos);
      console.log(`Test position "${offset.name}" at local ${offset.pos}, world: ${worldPos.toArray()}`);
      
      this.testMarkers.push(marker);
    });
    
    console.log('Test markers added to visualize potential weapon positions');
  }
};

// Initialize debug commands
if (typeof window !== 'undefined') {
  window.debugWeapons = {
    showBones: (player) => {
      DebugTools.visualizeBones(player);
      return "Bone visualization enabled";
    },
    findBestPosition: (player) => {
      DebugTools.findBestWeaponPosition(player);
      return "Test markers added at various positions";
    }
  };
}
