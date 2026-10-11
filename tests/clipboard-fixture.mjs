// Explicit synthetic clipboard fixture: Firefox does not preserve a supplied
// DataTransfer through ClipboardEvent's constructor. This is not OS clipboard QA.
export function pasteFixture(node, { text, html = '' }) {
  const clipboardData = new DataTransfer();
  clipboardData.setData('text/plain', text);
  if (html) clipboardData.setData('text/html', html);
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: clipboardData });
  node.dispatchEvent(event);
}
