import pptxgen from 'pptxgenjs';
import os from 'os';
import path from 'path';
import { mkdir } from 'fs/promises';
import type { PresentationInput } from '@local-assistant/shared';

// Where the backend process can write files (may be a container-internal path)
const DATA_DIR = process.env.DATA_DIR ?? path.join(os.homedir(), 'LocalAssistant');

// Host-side equivalent of DATA_DIR — used so the returned path is openable by
// the Tauri frontend. In Docker this differs from DATA_DIR; in local dev they
// are the same, so HOST_DATA_DIR need not be set.
const HOST_DATA_DIR = process.env.HOST_DATA_DIR || DATA_DIR;

export async function generatePresentation(input: PresentationInput): Promise<string> {
  const pptx = new pptxgen();
  pptx.layout = 'LAYOUT_16x9';

  for (const slide of input.slides) {
    const s = pptx.addSlide();

    s.addText(slide.title, {
      x: 0.5,
      y: 0.3,
      w: '90%',
      h: 1.0,
      fontSize: 28,
      bold: true,
      color: '222222',
    });

    const bullets = slide.bullets.slice(0, 5);
    if (bullets.length > 0) {
      s.addText(
        bullets.map((b: string) => ({ text: b, options: { bullet: true } })),
        {
          x: 0.5,
          y: 1.5,
          w: '90%',
          h: 4.5,
          fontSize: 18,
          color: '333333',
          valign: 'top',
        }
      );
    }

    if (slide.notes) {
      s.addNotes(slide.notes);
    }
  }

  const fileName = `presentation-${Date.now()}.pptx`;

  // Ensure the output directory exists inside the container
  const writeDir = path.join(DATA_DIR, 'presentations');
  await mkdir(writeDir, { recursive: true });

  // Write the file
  const writePath = path.join(writeDir, fileName);
  await pptx.writeFile({ fileName: writePath });

  // Return the path as seen from the host so Tauri can open it
  return path.join(HOST_DATA_DIR, 'presentations', fileName);
}
