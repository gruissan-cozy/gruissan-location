/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { attachTenantSignaturePad } from '../src/lib/tenant';

describe('signature tactile locataire', () => {
  const pads: Array<ReturnType<typeof attachTenantSignaturePad>> = [];
  afterEach(() => {
    pads.splice(0).forEach((pad) => pad.destroy());
  });

  function createPad() {
    const canvas = document.createElement('canvas');
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      x: 10, y: 20, left: 10, top: 20, right: 210, bottom: 100,
      width: 200, height: 80, toJSON: () => ({}),
    } as DOMRect);
    const context = {
      setTransform: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(),
      stroke: vi.fn(), clearRect: vi.fn(), lineWidth: 0, lineCap: 'butt', strokeStyle: '',
    } as unknown as CanvasRenderingContext2D;
    const pad = attachTenantSignaturePad(canvas, context);
    pads.push(pad);
    return { canvas, context, pad };
  }

  function pointer(canvas: HTMLCanvasElement, type: string, x: number, y: number) {
    const event = new Event(type);
    Object.defineProperties(event, {
      clientX: { value: x }, clientY: { value: y }, pointerId: { value: 7 },
    });
    canvas.dispatchEvent(event);
  }

  it('dessine un trait au toucher avec les coordonnées locales du canvas', () => {
    const { canvas, context, pad } = createPad();
    expect(pad.hasSignature).toBe(false);
    pointer(canvas, 'pointerdown', 30, 45);
    pointer(canvas, 'pointermove', 60, 75);
    pointer(canvas, 'pointerup', 60, 75);
    expect(pad.hasSignature).toBe(true);
    expect(context.beginPath).toHaveBeenCalledOnce();
    expect(context.moveTo).toHaveBeenCalledWith(20, 25);
    expect(context.lineTo).toHaveBeenCalledWith(50, 55);
    expect(context.stroke).toHaveBeenCalledOnce();
  });

  it('ne considère pas un simple toucher sans trait comme une signature', () => {
    const { canvas, pad } = createPad();
    pointer(canvas, 'pointerdown', 30, 45);
    pointer(canvas, 'pointerup', 30, 45);
    expect(pad.hasSignature).toBe(false);
  });

  it('dimensionne le canvas pour les écrans haute densité', () => {
    const original = window.devicePixelRatio;
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 2 });
    const { canvas, context } = createPad();
    expect(canvas.width).toBe(400);
    expect(canvas.height).toBe(160);
    expect(context.setTransform).toHaveBeenCalledWith(2, 0, 0, 2, 0, 0);
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: original });
  });

  it('efface la signature lors d’un redimensionnement qui détruit le canvas', () => {
    const { canvas, pad } = createPad();
    pointer(canvas, 'pointerdown', 30, 45);
    pointer(canvas, 'pointermove', 60, 75);
    expect(pad.hasSignature).toBe(true);
    window.dispatchEvent(new Event('resize'));
    expect(pad.hasSignature).toBe(false);
  });

  it('efface la signature et remet son état à vide', () => {
    const { canvas, context, pad } = createPad();
    pointer(canvas, 'pointerdown', 30, 45);
    pointer(canvas, 'pointerup', 30, 45);
    pad.clear();
    expect(pad.hasSignature).toBe(false);
    expect(context.clearRect).toHaveBeenCalledWith(0, 0, 200, 80);
  });
});
