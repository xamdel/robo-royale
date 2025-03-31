import { elements } from './elements.js'; // Assuming elements.container exists

let itemBadgeElement = null;

/**
 * Creates the DOM element for the item badge if it doesn't exist.
 */
function createItemBadgeElement() {
  if (itemBadgeElement) return;

  itemBadgeElement = document.createElement('div');
  itemBadgeElement.id = 'item-pickup-badge';
  itemBadgeElement.className = 'item-badge'; // Use this class for styling
  itemBadgeElement.style.position = 'absolute';
  itemBadgeElement.style.display = 'none'; // Initially hidden
  itemBadgeElement.style.pointerEvents = 'none'; // Prevent interaction
  itemBadgeElement.style.zIndex = '1500'; // Ensure it's above game, below HUD elements like context menu

  // Basic structure (can be enhanced with icons, etc.)
  itemBadgeElement.innerHTML = `
    <div class="item-badge-name">Item Name</div>
    <div class="item-badge-stats">
      <span>DMG: ???</span> | <span>AMMO: ???</span>
    </div>
  `;

  // Append to the main HUD container or body
  // If elements.container is the main HUD div:
  if (elements.container) {
      elements.container.appendChild(itemBadgeElement);
      console.log("[HUD ItemBadge] Badge element created and added to HUD container.");
  } else {
      // Fallback to body, though HUD container is preferred
      document.body.appendChild(itemBadgeElement);
      console.warn("[HUD ItemBadge] HUD container not found, appending badge to body.");
  }
}

/**
 * Shows the item badge at a specific screen position with item details.
 * @param {object} itemInfo - Information about the item (e.g., { name, damage, ammo, config })
 * @param {object} screenPosition - Screen coordinates (e.g., { x, y })
 */
export function showItemBadge(itemInfo, screenPosition) {
  if (!itemBadgeElement) {
    createItemBadgeElement();
  }

  if (!itemInfo || !screenPosition) {
      console.warn("[HUD ItemBadge] Missing itemInfo or screenPosition for showItemBadge.");
      hideItemBadge(); // Hide if data is incomplete
      return;
  }

  // Update content
  const nameElement = itemBadgeElement.querySelector('.item-badge-name');
  const statsElement = itemBadgeElement.querySelector('.item-badge-stats');

  if (nameElement) {
    nameElement.textContent = itemInfo.config?.displayName || itemInfo.type || 'Unknown Item';
  }
  if (statsElement) {
    // Adjust based on actual properties available in itemInfo/itemInfo.config
    const damage = itemInfo.config?.damage || 'N/A';
    const ammo = itemInfo.config?.maxAmmo !== undefined ? itemInfo.config.maxAmmo : 'N/A'; // Or current ammo if relevant
    statsElement.innerHTML = `<span>DMG: ${damage}</span> | <span>AMMO: ${ammo}</span>`;
  }

  // Position the badge - center it horizontally above the screen position
  itemBadgeElement.style.left = `${screenPosition.x}px`;
  itemBadgeElement.style.top = `${screenPosition.y}px`;
  // Adjust transform to center and offset slightly above the point
  itemBadgeElement.style.transform = 'translate(-50%, -120%)'; // Move up by 120% of its height

  itemBadgeElement.style.display = 'block';
}

/**
 * Hides the item badge.
 */
export function hideItemBadge() {
  if (itemBadgeElement) {
    itemBadgeElement.style.display = 'none';
  }
}

// Optional: Initialize here if needed, or rely on first showItemBadge call
// createItemBadgeElement();
