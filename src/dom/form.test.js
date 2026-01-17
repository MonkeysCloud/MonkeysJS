import { describe, it, expect, vi } from 'vitest';
import { useForm } from './form';
import { ref } from '../core/reactive';

describe('Form Handling', () => {
  it('should initialize with default values', () => {
    const form = useForm({
      name: '',
      email: ''
    });
    
    expect(form.values.name).toBe('');
    expect(form.values.email).toBe('');
    expect(form.isValid.value).toBe(true); // Default valid if no rules?
  });

  it('should validate fields', () => {
    const form = useForm({
      name: ''
    });
    
    form.defineRules({
      name: [{ type: 'required', message: 'Name is required' }]
    });
    
    expect(form.validate()).toBe(false);
    expect(form.errors.name).toBe('Name is required');
    
    form.setValue('name', 'John');
    expect(form.validate()).toBe(true);
    expect(form.errors.name).toBeUndefined();
  });

  it('should handle submit', async () => {
    const form = useForm({
      name: 'John'
    });
    
    const submitFn = vi.fn().mockResolvedValue({ success: true });
    
    await form.handleSubmit(submitFn);
    
    expect(submitFn).toHaveBeenCalledWith({ name: 'John' });
    expect(form.isSubmitting.value).toBe(false);
  });
});
