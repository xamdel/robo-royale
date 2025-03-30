import { elements } from './elements.js';
import { weaponSystem } from '../weapons/index.js'; // Need weaponSystem to check mount availability

// --- Context Menu State ---
let contextMenuElement = null;
let currentContextMenuTarget = null; // { id, type, model, distance }
let highlightedMountId = null;
let mousePosition = { x: 0, y: 0 };

// --- Mouse Tracking ---
function updateMousePosition(event) {
  mousePosition.x = event.clientX;
  mousePosition.y = event.clientY;
  // Update highlight if menu is active
  if (contextMenuElement && contextMenuElement.style.display !== 'none') {
    updateContextMenuHighlight();
  }
}

export function setupMouseListener() {
   // Ensure listener is added only once
   document.removeEventListener('mousemove', updateMousePosition);
   document.addEventListener('mousemove', updateMousePosition);
   console.log("[HUD ContextMenu] Mouse listener set up.");
}

// --- Internal Functions ---
function createContextMenuElement() {
  if (contextMenuElement) return; // Already created

  contextMenuElement = document.createElement('div');
  contextMenuElement.id = 'weapon-context-menu';
  // Basic styling - will be refined by CSS in hud.css
  contextMenuElement.style.position = 'absolute';
  contextMenuElement.style.display = 'none'; // Initially hidden
  // contextMenuElement.style.pointerEvents = 'none'; // Container is non-interactive, quadrants are
  contextMenuElement.style.zIndex = '2000';
  document.body.appendChild(contextMenuElement); // Append to body to overlay everything
  console.log("[HUD ContextMenu] Context menu element created.");
}

function updateContextMenuHighlight() {
  if (!contextMenuElement || contextMenuElement.style.display === 'none') return;

  const menuRect = contextMenuElement.getBoundingClientRect();
  const centerX = menuRect.left + menuRect.width / 2;
  const centerY = menuRect.top + menuRect.height / 2;

  const dx = mousePosition.x - centerX;
  const dy = mousePosition.y - centerY;
  
  // Determine quadrant based on position relative to center
  let targetQuadrantId = null;
  
  // Bullseye arrangement - two above meridian, two below
  if (dy < 0) { // Above the meridian (top half)
    if (dx < 0) {
      targetQuadrantId = 'leftShoulder'; // Top Left
    } else {
      targetQuadrantId = 'rightShoulder'; // Top Right
    }
  } else { // Below the meridian (bottom half)
    if (dx < 0) {
      targetQuadrantId = 'leftArm'; // Bottom Left
    } else {
      targetQuadrantId = 'rightArm'; // Bottom Right
    }
  }

  highlightedMountId = null; // Reset before checking availability

  // Update visual highlight
  const quadrants = contextMenuElement.querySelectorAll('.context-menu-quadrant');
  quadrants.forEach(q => {
    const mountId = q.dataset.mountId;
    const isTargetQuadrant = (mountId === targetQuadrantId);
    const mount = weaponSystem.mountManager.getMountPoint(mountId); // Get mount point info

    // Clear previous dynamic classes
    q.classList.remove('highlighted'); 

    if (mount) { // Check if the mount exists
      // Add appropriate class based on occupied status (already done in showWeaponContextMenu)
      // q.classList.toggle('occupied', !!mount.getWeapon());
      // q.classList.toggle('available', !mount.getWeapon());
      
      // Highlight if the mouse is targeting this quadrant
      if (isTargetQuadrant) {
        q.classList.add('highlighted');
        highlightedMountId = mountId; // Set the highlighted ID regardless of occupied status
      }
    } else {
      // Should not happen, but handle defensively
      q.classList.add('unavailable'); 
    }
  });
   // console.log("[HUD ContextMenu] Highlighted Mount ID:", highlightedMountId); // Debug
}


// --- Exported Functions ---
// Modified to accept all mounts and display current weapon if occupied
export function showWeaponContextMenu(position, allMounts, pickupInfo) {
  console.log("[HUD ContextMenu] Showing context menu for:", pickupInfo.type, "All mounts:", allMounts.map(m => m.id ? `${m.id}(${m.getWeapon()?.type || 'empty'})` : 'unknown'));
  if (!contextMenuElement) {
    createContextMenuElement();
  }

  currentContextMenuTarget = pickupInfo;
  highlightedMountId = null; // Reset highlight

  // Position the menu near the mouse cursor
  // Use last known mouse position as fallback if position is null
  const menuSize = 220; // Updated size from CSS
  const menuX = (position?.x ?? mousePosition.x) - menuSize / 2; // Center horizontally
  const menuY = (position?.y ?? mousePosition.y) - menuSize / 2; // Center vertically
  contextMenuElement.style.left = `${menuX}px`;
  contextMenuElement.style.top = `${menuY}px`;

  // Clear previous quadrants
  contextMenuElement.innerHTML = '';

  // Define quadrants (shoulders on top, arms on bottom)
  const quadrantMap = {
    rightShoulder: { name: 'R Shoulder' },
    leftShoulder:  { name: 'L Shoulder' },
    rightArm:      { name: 'R Arm' },
    leftArm:       { name: 'L Arm' }
  };

  // Create quadrants based on all mounts, indicating occupied status
  const allMountsMap = new Map(allMounts.map(m => [m.id, m]));

  for (const mountId in quadrantMap) {
    const quadrant = quadrantMap[mountId];
    const mount = allMountsMap.get(mountId);
    const quadrantDiv = document.createElement('div');
    quadrantDiv.className = 'context-menu-quadrant';
    quadrantDiv.dataset.mountId = mountId; // Store mount ID

    // Create the label span
    const labelSpan = document.createElement('span');
    labelSpan.className = 'quadrant-label';
    labelSpan.textContent = quadrant.name; // Always show mount name

    quadrantDiv.appendChild(labelSpan); // Add mount label first

    if (mount) {
      const currentWeapon = mount.getWeapon();
      if (currentWeapon) {
        // Slot is occupied - add weapon name in a separate span
        const weaponName = currentWeapon.config.displayName || currentWeapon.type;
        const weaponSpan = document.createElement('span');
        weaponSpan.className = 'quadrant-weapon-name';
        weaponSpan.textContent = weaponName.toUpperCase();
        quadrantDiv.appendChild(weaponSpan); // Add weapon name span below mount label
        quadrantDiv.classList.add('occupied');
      } else {
        // Slot is empty
        quadrantDiv.classList.add('available');
      }
    } else {
      // Mount doesn't exist? Should not happen.
      labelSpan.textContent = `${quadrant.name}: N/A`; // Keep N/A in main label if mount missing
      quadrantDiv.classList.add('unavailable');
    }

    contextMenuElement.appendChild(quadrantDiv);
  }

  // Add center text (weapon being picked up)
  const centerText = document.createElement('div');
  centerText.className = 'context-menu-center';
  centerText.textContent = (pickupInfo.config?.displayName || pickupInfo.type).toUpperCase();
  contextMenuElement.appendChild(centerText);


  contextMenuElement.style.display = 'block'; // Use block display (CSS handles quadrant positioning)
  updateContextMenuHighlight(); // Initial highlight check
}

export function hideWeaponContextMenu() {
  if (contextMenuElement) {
    contextMenuElement.style.display = 'none';
  }
  highlightedMountId = null;
  currentContextMenuTarget = null;
  console.log("[HUD ContextMenu] Context menu hidden.");
}

export function getSelectedMountFromContextMenu() {
  // Return the ID that was last highlighted AND available
  // highlightedMountId is already updated in updateContextMenuHighlight to only store available+targeted mounts
  console.log("[HUD ContextMenu] Returning selected mount:", highlightedMountId);
  return highlightedMountId;
}
