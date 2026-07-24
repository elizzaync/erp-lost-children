import { describe, it, expect, vi } from 'vitest';
import { EventBus } from './event-bus';

describe('EventBus', () => {
  it('entrega el payload a los suscriptores', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on('personas:update', handler);
    bus.emit('personas:update', { id: 1 });
    expect(handler).toHaveBeenCalledWith({ id: 1 });
  });

  it('la función devuelta por on() desuscribe', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    const off = bus.on('x', handler);
    off();
    bus.emit('x');
    expect(handler).not.toHaveBeenCalled();
  });

  it('off() remueve el handler indicado', () => {
    const bus = new EventBus();
    const a = vi.fn();
    const b = vi.fn();
    bus.on('x', a);
    bus.on('x', b);
    bus.off('x', a);
    bus.emit('x');
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledOnce();
  });

  it('un handler que lanza no impide que los demás reciban el evento', () => {
    const bus = new EventBus();
    const boom = vi.fn(() => { throw new Error('boom'); });
    const ok = vi.fn();
    bus.on('x', boom);
    bus.on('x', ok);
    expect(() => bus.emit('x')).not.toThrow();
    expect(ok).toHaveBeenCalledOnce();
  });

  it('emitir un evento sin suscriptores no falla', () => {
    const bus = new EventBus();
    expect(() => bus.emit('inexistente')).not.toThrow();
  });

  it('un handler puede desuscribirse durante la emisión sin romper el recorrido', () => {
    const bus = new EventBus();
    const b = vi.fn();
    const a = vi.fn(() => bus.off('x', a));
    bus.on('x', a);
    bus.on('x', b);
    bus.emit('x');
    expect(b).toHaveBeenCalledOnce();
    expect(bus.count('x')).toBe(1);
  });
});
