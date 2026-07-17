import { describeElement } from '@core/selectors/describe-element';
import type { ElementDescriptor } from '@dtypes/element';

const HIGHLIGHT_ID = 'wds-picker-highlight';
const LABEL_ID = 'wds-picker-label';

function ensureOverlayNodes(): { box: HTMLDivElement; label: HTMLDivElement } {
  let box = document.getElementById(HIGHLIGHT_ID) as HTMLDivElement | null;
  let label = document.getElementById(LABEL_ID) as HTMLDivElement | null;
  if (!box) {
    box = document.createElement('div');
    box.id = HIGHLIGHT_ID;
    document.documentElement.appendChild(box);
  }
  if (!label) {
    label = document.createElement('div');
    label.id = LABEL_ID;
    document.documentElement.appendChild(label);
  }
  return { box, label };
}

function positionOverlay(el: Element): void {
  const { box, label } = ensureOverlayNodes();
  const rect = el.getBoundingClientRect();
  box.style.top = `${rect.top}px`;
  box.style.left = `${rect.left}px`;
  box.style.width = `${rect.width}px`;
  box.style.height = `${rect.height}px`;
  label.textContent = `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}`;
  const labelTop = rect.top > 20 ? rect.top - 20 : rect.bottom + 2;
  label.style.top = `${labelTop}px`;
  label.style.left = `${rect.left}px`;
}

function removeOverlayNodes(): void {
  document.getElementById(HIGHLIGHT_ID)?.remove();
  document.getElementById(LABEL_ID)?.remove();
}

export class ElementPicker {
  private active = false;
  private lastEl: Element | null = null;

  constructor(
    private readonly onHover: (descriptor: ElementDescriptor | null) => void,
    private readonly onSelect: (descriptor: ElementDescriptor) => void
  ) {
    this.handleMouseMove = this.handleMouseMove.bind(this);
    this.handleClick = this.handleClick.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
  }

  start(): void {
    if (this.active) return;
    this.active = true;
    document.addEventListener('mousemove', this.handleMouseMove, true);
    document.addEventListener('click', this.handleClick, true);
    document.addEventListener('keydown', this.handleKeyDown, true);
    document.body.style.cursor = 'crosshair';
  }

  stop(): void {
    if (!this.active) return;
    this.active = false;
    document.removeEventListener('mousemove', this.handleMouseMove, true);
    document.removeEventListener('click', this.handleClick, true);
    document.removeEventListener('keydown', this.handleKeyDown, true);
    document.body.style.cursor = '';
    removeOverlayNodes();
    this.lastEl = null;
    this.onHover(null);
  }

  isActive(): boolean {
    return this.active;
  }

  private handleMouseMove(e: MouseEvent): void {
    const target = e.target as Element | null;
    if (!target || target === this.lastEl || target.id === HIGHLIGHT_ID || target.id === LABEL_ID) return;
    this.lastEl = target;
    positionOverlay(target);
    this.onHover(describeElement(target));
  }

  private handleClick(e: MouseEvent): void {
    if (!this.active) return;
    e.preventDefault();
    e.stopPropagation();
    const target = e.target as Element | null;
    if (!target) return;
    const descriptor = describeElement(target);
    this.onSelect(descriptor);
    this.stop();
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape') this.stop();
  }
}
