import { elements } from './elements.js';

export function createMessageLogs() {
  // Message log container
  elements.messageLogs = document.createElement('div');
  elements.messageLogs.className = 'message-logs';

  // Message log title
  const messageTitle = document.createElement('div');
  messageTitle.className = 'message-title';
  messageTitle.innerHTML = '<span>COMMS</span>';
  elements.messageLogs.appendChild(messageTitle);

  elements.container.appendChild(elements.messageLogs);
}

export function addMessage(message) {
  // Create message element
  const messageElement = document.createElement('div');
  messageElement.className = 'message';
  messageElement.textContent = message;

  // Add to message logs
  elements.messageLogs.appendChild(messageElement);

  // Remove message after 4 seconds
  setTimeout(() => {
    messageElement.style.opacity = '0'; // Start fade out
    setTimeout(() => {
      messageElement.remove();
    }, 500); // Remove after fade out animation (adjust timing if needed)
  }, 4000); // 4 second timeout
}
