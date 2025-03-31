import { elements } from './elements.js';
import { weaponSystem } from '../weapons/index.js'; // Need weaponSystem to check mount availability

// --- Context Menu State ---
let contextMenuElement = null; // For desktop radial menu
let mobileMountSelectorElement = null; // For mobile grid menu
let currentContextMenuTarget = null; // { id, type, model, distance } - Shared state
let highlightedMountId = null; // For desktop radial menu highlight
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
  document.body.appendChild(contextMenuElement);
  console.log("[HUD ContextMenu] Desktop context menu element created.");
}

// Create the mobile grid selector element
function createMobileMountSelectorElement() {
    if (mobileMountSelectorElement) return;

    mobileMountSelectorElement = document.createElement('div');
    mobileMountSelectorElement.id = 'mobile-mount-selector';
    mobileMountSelectorElement.style.position = 'absolute';
    mobileMountSelectorElement.style.display = 'none'; // Initially hidden
    mobileMountSelectorElement.style.zIndex = '2100'; // Ensure it's above other HUD elements
    document.body.appendChild(mobileMountSelectorElement);
    console.log("[HUD ContextMenu] Mobile mount selector element created.");
}


// --- Desktop Radial Menu Highlighting ---
function updateContextMenuHighlight() { // Only used for desktop now
  if (!contextMenuElement || contextMenuElement.style.display === 'none') return null; // Return null if not applicable

  // Log current mouse position being used for highlight calculation
  // console.log(`[HUD ContextMenu] updateContextMenuHighlight - Mouse Pos: x=${mousePosition.x}, y=${mousePosition.y}`);

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
   console.log("[HUD ContextMenu] Highlight Update - Resulting highlightedMountId:", highlightedMountId); // Log the result
   return highlightedMountId; // Return the ID for the manager
  } // Closing brace for updateContextMenuHighlight
// Removed extra closing brace here


// --- Exported Functions ---
// Shows either the desktop radial menu or the mobile grid selector
export function showWeaponContextMenu(position, allMounts, pickupInfo, isMobile = false) {
  console.log(`[HUD] Showing weapon selection UI (Mobile: ${isMobile}) for:`, pickupInfo.type);

  currentContextMenuTarget = pickupInfo; // Store the weapon info being picked up

  if (isMobile) {
    showMobileMountSelector(allMounts, pickupInfo);
  } else {
    showDesktopContextMenu(position, allMounts, pickupInfo);
  }
}

// --- Desktop Radial Menu Logic ---
function showDesktopContextMenu(position, allMounts, pickupInfo) {
    if (!contextMenuElement) {
        createContextMenuElement();
    }
    highlightedMountId = null; // Reset highlight for desktop

    // Position near mouse cursor
    const menuSize = 220; // Desktop size
    const menuX = (position?.x ?? mousePosition.x) - menuSize / 2;
    const menuY = (position?.y ?? mousePosition.y) - menuSize / 2;
    contextMenuElement.style.left = `${Math.max(0, Math.min(window.innerWidth - menuSize, menuX))}px`;
    contextMenuElement.style.top = `${Math.max(0, Math.min(window.innerHeight - menuSize, menuY))}px`;

    // Clear previous content
    contextMenuElement.innerHTML = '';
    contextMenuElement.classList.remove('mobile-context-menu'); // Ensure mobile class is absent

    // Define quadrants (Using the one defined outside the function scope is intended, removing duplicate)
    const quadrantMap = {
        rightShoulder: { name: 'R Shoulder' },
        leftShoulder:  { name: 'L Shoulder' },
        rightArm:      { name: 'R Arm' },
        leftArm:       { name: 'L Arm' }
    };
    // Create quadrants
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
    // contextMenuElement.appendChild(centerText); // Already appended above loop

    contextMenuElement.style.display = 'block';
    updateContextMenuHighlight(); // Initial highlight check for desktop
}

// --- Mobile Grid Selector Logic ---
function showMobileMountSelector(allMounts, pickupInfo) {
    if (!mobileMountSelectorElement) {
        createMobileMountSelectorElement();
    }

    // Center the grid on screen
    const gridWidth = 240; // Adjust as needed via CSS
    const gridHeight = 240; // Adjust as needed via CSS
    mobileMountSelectorElement.style.left = `${(window.innerWidth - gridWidth) / 2}px`;
    mobileMountSelectorElement.style.top = `${(window.innerHeight - gridHeight) / 2}px`;

    // Clear previous content
    mobileMountSelectorElement.innerHTML = '';

    // Add title (weapon being picked up)
    const title = document.createElement('div');
    title.className = 'mount-selector-title';
    title.textContent = `Equip ${pickupInfo.config?.displayName || pickupInfo.type}?`;
    mobileMountSelectorElement.appendChild(title);

    // Create 2x2 grid container
    const gridContainer = document.createElement('div');
    gridContainer.className = 'mount-selector-grid';
    mobileMountSelectorElement.appendChild(gridContainer);

    // Define grid order (matches visual layout)
    const gridOrder = ['leftShoulder', 'rightShoulder', 'leftArm', 'rightArm'];
    const mountMap = new Map(allMounts.map(m => [m.id, m]));

    gridOrder.forEach(mountId => {
        const mount = mountMap.get(mountId);
        const cell = document.createElement('button'); // Use button for interaction
        cell.className = 'mount-selector-cell';
        cell.dataset.mountId = mountId;

        let cellContent = '';
        const mountNameMap = { // Simple mapping for display names
             leftShoulder: 'L Shoulder', rightShoulder: 'R Shoulder',
             leftArm: 'L Arm', rightArm: 'R Arm'
        };
        const mountDisplayName = mountNameMap[mountId] || mountId;

        if (mount) {
            const currentWeapon = mount.getWeapon();
            cellContent = `<div class="mount-name">${mountDisplayName}</div>`;
            if (currentWeapon) {
                cellContent += `<div class="current-weapon">${currentWeapon.config.displayName || currentWeapon.type}</div>`;
                cell.classList.add('occupied');
            } else {
                cellContent += `<div class="current-weapon">(Empty)</div>`;
                cell.classList.add('available');
            }
        } else {
            cellContent = `<div class="mount-name">${mountDisplayName}</div><div class="current-weapon">N/A</div>`;
            cell.classList.add('unavailable');
            cell.disabled = true; // Disable unavailable slots
        }
        cell.innerHTML = cellContent;

        // Add event listener for tap/click
        if (mount) { // Only add listener if mount exists
             cell.addEventListener('click', () => handleMobileMountSelection(mountId));
             // Use 'touchstart' for potentially faster response on mobile, but 'click' is more robust
             // cell.addEventListener('touchstart', (e) => { e.preventDefault(); handleMobileMountSelection(mountId); });
        }

        gridContainer.appendChild(cell);
    });

    // Add a cancel button
    const cancelButton = document.createElement('button');
    cancelButton.className = 'mount-selector-cancel';
    cancelButton.textContent = 'Cancel';
    cancelButton.addEventListener('click', hideWeaponContextMenu); // Reuse hide function
    mobileMountSelectorElement.appendChild(cancelButton);


    mobileMountSelectorElement.style.display = 'flex'; // Use flex for column layout
}

// Handles the tap on a mobile grid cell
function handleMobileMountSelection(mountId) {
    console.log(`[HUD] Mobile mount selected: ${mountId}`);
    hideWeaponContextMenu(); // Hide the grid first

    // Trigger the actual weapon equip logic (needs access to Game state)
    if (window.Game && typeof window.Game.handleContextMenuSelection === 'function' && currentContextMenuTarget) {
        window.Game.handleContextMenuSelection(mountId, currentContextMenuTarget); // Pass target weapon info
    } else {
        console.warn("[HUD] Game.handleContextMenuSelection function not found or target weapon missing.");
    }
}


// --- Common Hide Function ---
export function hideWeaponContextMenu() {
  // Hide both potential menus
  if (contextMenuElement) {
    contextMenuElement.style.display = 'none';
  }
  if (mobileMountSelectorElement) {
      mobileMountSelectorElement.style.display = 'none';
  }

  highlightedMountId = null; // Reset desktop highlight state
  currentContextMenuTarget = null; // Reset shared target state
  console.log("[HUD] Weapon selection UI hidden.");
}


// --- Desktop-Specific Function ---
export function getSelectedMountFromContextMenu() {
  // Return the ID that was last highlighted
  console.log("[HUD ContextMenu] Returning selected mount:", highlightedMountId);
  return highlightedMountId;
}
