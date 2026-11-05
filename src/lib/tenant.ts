export const TENANT_ROOMS = ['living', 'kitchen', 'bedroom', 'mezzanine', 'bathroom', 'entrance'] as const;
export type TenantRoom = (typeof TENANT_ROOMS)[number];
export type TenantMoment = 'checkin' | 'checkout';

export type TenantChecklistEntry = {
  room: string;
  item: string;
  ok: boolean;
  note: string | null;
};

export type TenantPhotoEntry = {
  room: string;
  moment: string;
};

export type TenantPreflightError = 'assessment' | 'photos' | 'signature' | null;

/** Vérifie que chaque pièce est explicitement OK ou qu’un problème est décrit. */
export function missingTenantAssessments(
  checklist: readonly TenantChecklistEntry[],
  rooms: readonly string[] = TENANT_ROOMS,
): string[] {
  return rooms.filter((room) => {
    const entry = checklist.find((row) => row.room === room && row.item === 'condition');
    return !entry || (!entry.ok && !entry.note?.trim());
  });
}

/** Vérifie la présence d’au moins une photo par pièce pour l’étape choisie. */
export function missingTenantPhotos(
  photos: readonly TenantPhotoEntry[],
  moment: TenantMoment,
  rooms: readonly string[] = TENANT_ROOMS,
): string[] {
  return rooms.filter((room) => !photos.some((photo) => photo.room === room && photo.moment === moment));
}

/** Garde partagée par l’interface et ses tests avant de générer un rapport. */
export function tenantReportPreflight(
  checklist: readonly TenantChecklistEntry[],
  photos: readonly TenantPhotoEntry[],
  moment: TenantMoment,
  signed: boolean,
): TenantPreflightError {
  if (missingTenantAssessments(checklist).length) return 'assessment';
  if (missingTenantPhotos(photos, moment).length) return 'photos';
  if (!signed) return 'signature';
  return null;
}

/** Relie un canvas à un stylet/doigt et expose l’état de signature. */
export function attachTenantSignaturePad(
  canvas: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
): { readonly hasSignature: boolean; clear: () => void; destroy: () => void } {
  let drawing = false;
  let hasSignature = false;

  const resize = () => {
    const hadSignature = hasSignature;
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(rect.width * ratio));
    canvas.height = Math.max(1, Math.round(rect.height * ratio));
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.lineWidth = 2;
    context.lineCap = 'round';
    context.strokeStyle = '#123f5c';
    if (hadSignature) hasSignature = false;
  };
  const point = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  const down = (event: PointerEvent) => {
    drawing = true;
    const p = point(event);
    context.beginPath();
    context.moveTo(p.x, p.y);
    canvas.setPointerCapture?.(event.pointerId);
  };
  const move = (event: PointerEvent) => {
    if (!drawing) return;
    const p = point(event);
    context.lineTo(p.x, p.y);
    context.stroke();
    hasSignature = true;
  };
  const stop = (event: PointerEvent) => {
    drawing = false;
    if (canvas.hasPointerCapture?.(event.pointerId)) canvas.releasePointerCapture?.(event.pointerId);
  };
  const clear = () => {
    context.clearRect(0, 0, canvas.width, canvas.height);
    hasSignature = false;
  };

  resize();
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', stop);
  canvas.addEventListener('pointercancel', stop);
  window.addEventListener('resize', resize);

  return {
    get hasSignature() { return hasSignature; },
    clear,
    destroy() {
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', stop);
      canvas.removeEventListener('pointercancel', stop);
      window.removeEventListener('resize', resize);
    },
  };
}
