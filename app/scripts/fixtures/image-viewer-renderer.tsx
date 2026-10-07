import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ChatMarkdown } from '../../src/components/ChatMarkdown';
import { ImageViewer } from '../../src/components/ImageViewer';
import '../../src/App.css';

const canvas = document.createElement('canvas'); canvas.width = 1600; canvas.height = 1000;
const context = canvas.getContext('2d')!;
context.fillStyle = '#143845'; context.fillRect(0, 0, 1600, 1000);
context.fillStyle = '#64dec7'; context.font = '64px sans-serif'; context.fillText('Image viewer · zoom / pan / copy', 80, 200);
context.strokeStyle = '#64dec7'; for (let x = 0; x < 1600; x += 100) { context.strokeRect(x, 300, 80, 400); }
const dataUrl = canvas.toDataURL('image/png');
window.imageFixture = { copies: [], failCopy: false, opened: [] };
window.multiAgentElectron = {
  invoke: async (command, args) => {
    if (command === 'read_image_data_url') return dataUrl;
    if (command === 'clipboard_write_image') {
      if (window.imageFixture.failCopy) throw new Error('fixture copy failure');
      window.imageFixture.copies.push(args); return null;
    }
    return null;
  }, onEvent: () => () => {},
};
function Harness() {
  const [path, setPath] = useState('');
  return <><ChatMarkdown onOpenPath={next => { window.imageFixture.opened.push(next); setPath(next); }}>{'`output/akari-parts-v1-2026-10-07/character-four-view.png`\n\n[결과 이미지](K:/Exports/SummerSix-20261007/preview.png)'}</ChatMarkdown>
    {path && <ImageViewer path={path} folder="C:/Fixture" onClose={() => setPath('')} />}</>;
}
createRoot(document.getElementById('root')!).render(<Harness />);
