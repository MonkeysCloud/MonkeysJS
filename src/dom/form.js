/**
 * MonkeysJS - Form Utilities
 * Form handling, validation, and submission helpers
 */

import { reactive, ref, computed, watch } from '../core/reactive.js';
import { http, RequestState } from '../http/client.js';

/**
 * Create a reactive form with validation
 */
export function useForm(initialValues = {}, options = {}) {
  const {
    validateOnChange = true,
    validateOnBlur = true,
    validateOnSubmit = true,
    resetOnSubmit = false,
    transform,
    validate: customValidate
  } = options;

  // Form state
  const values = reactive({ ...initialValues });
  const errors = reactive({});
  const touched = reactive({});
  const dirty = reactive({});
  
  // Submission state
  const isSubmitting = ref(false);
  const submitCount = ref(0);
  const submitError = ref(null);

  // Computed
  const isValid = computed(() => Object.keys(errors).length === 0);
  const isDirty = computed(() => Object.values(dirty).some(Boolean));
  const isTouched = computed(() => Object.values(touched).some(Boolean));

  // Validation rules registry
  const rules = {};

  /**
   * Built-in validators
   */
  const validators = {
    required: (value, _, message = 'This field is required') => {
      if (value === undefined || value === null || value === '' || 
          (Array.isArray(value) && value.length === 0)) {
        return message;
      }
      return null;
    },

    email: (value, _, message = 'Invalid email address') => {
      if (!value) return null;
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return emailRegex.test(value) ? null : message;
    },

    min: (value, min, message) => {
      if (!value) return null;
      if (typeof value === 'number') {
        return value >= min ? null : (message || `Must be at least ${min}`);
      }
      if (typeof value === 'string') {
        return value.length >= min ? null : (message || `Must be at least ${min} characters`);
      }
      if (Array.isArray(value)) {
        return value.length >= min ? null : (message || `Must have at least ${min} items`);
      }
      return null;
    },

    max: (value, max, message) => {
      if (!value) return null;
      if (typeof value === 'number') {
        return value <= max ? null : (message || `Must be at most ${max}`);
      }
      if (typeof value === 'string') {
        return value.length <= max ? null : (message || `Must be at most ${max} characters`);
      }
      if (Array.isArray(value)) {
        return value.length <= max ? null : (message || `Must have at most ${max} items`);
      }
      return null;
    },

    pattern: (value, pattern, message = 'Invalid format') => {
      if (!value) return null;
      const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
      return regex.test(value) ? null : message;
    },

    url: (value, _, message = 'Invalid URL') => {
      if (!value) return null;
      try {
        new URL(value);
        return null;
      } catch {
        return message;
      }
    },

    matches: (value, field, message) => {
      return value === values[field] ? null : (message || `Must match ${field}`);
    },

    custom: (value, validator) => {
      return validator(value, values);
    }
  };

  /**
   * Define validation rules for a field
   */
  function defineRules(fieldRules) {
    Object.assign(rules, fieldRules);
  }

  /**
   * Validate a single field
   */
  function validateField(field) {
    const fieldRules = rules[field];
    if (!fieldRules) {
      delete errors[field];
      return true;
    }

    const value = values[field];
    const ruleList = Array.isArray(fieldRules) ? fieldRules : [fieldRules];

    for (const rule of ruleList) {
      let error = null;

      if (typeof rule === 'function') {
        error = rule(value, values);
      } else if (typeof rule === 'object') {
        const { type, value: ruleValue, message } = rule;
        if (validators[type]) {
          error = validators[type](value, ruleValue, message);
        }
      } else if (typeof rule === 'string' && validators[rule]) {
        error = validators[rule](value);
      }

      if (error) {
        errors[field] = error;
        return false;
      }
    }

    delete errors[field];
    return true;
  }

  /**
   * Validate all fields
   */
  function validate() {
    let isFormValid = true;
    
    // Clear all errors first
    Object.keys(errors).forEach(key => delete errors[key]);

    // Run custom validation if provided
    if (customValidate) {
      const customErrors = customValidate(values);
      if (customErrors && typeof customErrors === 'object') {
        Object.assign(errors, customErrors);
        isFormValid = Object.keys(customErrors).length === 0;
      }
    }

    // Run field rules
    Object.keys(rules).forEach(field => {
      if (!validateField(field)) {
        isFormValid = false;
      }
    });

    return isFormValid;
  }

  /**
   * Set field value
   */
  function setValue(field, value) {
    const oldValue = values[field];
    values[field] = value;
    dirty[field] = value !== initialValues[field];

    if (validateOnChange) {
      validateField(field);
    }
  }

  /**
   * Set multiple values
   */
  function setValues(newValues) {
    Object.entries(newValues).forEach(([field, value]) => {
      setValue(field, value);
    });
  }

  /**
   * Set field as touched
   */
  function setTouched(field, isTouched = true) {
    touched[field] = isTouched;

    if (validateOnBlur && isTouched) {
      validateField(field);
    }
  }

  /**
   * Set field error
   */
  function setError(field, message) {
    if (message) {
      errors[field] = message;
    } else {
      delete errors[field];
    }
  }

  /**
   * Clear field error
   */
  function clearError(field) {
    delete errors[field];
  }

  /**
   * Clear all errors
   */
  function clearErrors() {
    Object.keys(errors).forEach(key => delete errors[key]);
  }

  /**
   * Reset form to initial values
   */
  function reset(newInitialValues) {
    const resetTo = newInitialValues || initialValues;
    
    Object.keys(values).forEach(key => delete values[key]);
    Object.keys(errors).forEach(key => delete errors[key]);
    Object.keys(touched).forEach(key => delete touched[key]);
    Object.keys(dirty).forEach(key => delete dirty[key]);
    
    Object.assign(values, resetTo);
    
    if (newInitialValues) {
      Object.assign(initialValues, newInitialValues);
    }

    submitError.value = null;
  }

  /**
   * Submit handler
   */
  async function handleSubmit(onSubmit) {
    submitCount.value++;
    submitError.value = null;

    if (validateOnSubmit && !validate()) {
      return { success: false, errors: { ...errors } };
    }

    isSubmitting.value = true;

    try {
      const submitValues = transform ? transform(values) : { ...values };
      const result = await onSubmit(submitValues);

      if (resetOnSubmit) {
        reset();
      }

      return { success: true, data: result };
    } catch (error) {
      submitError.value = error;
      return { success: false, error };
    } finally {
      isSubmitting.value = false;
    }
  }

  /**
   * Create field binding object
   */
  function field(name) {
    return {
      get value() {
        return values[name];
      },
      set value(val) {
        setValue(name, val);
      },
      get error() {
        return errors[name];
      },
      get touched() {
        return touched[name];
      },
      get dirty() {
        return dirty[name];
      },
      onChange(value) {
        setValue(name, value);
      },
      onBlur() {
        setTouched(name);
      },
      // For DOM binding
      bind: {
        value: values[name],
        onInput: (e) => setValue(name, e.target.value),
        onBlur: () => setTouched(name)
      }
    };
  }

  return {
    // State
    values,
    errors,
    touched,
    dirty,
    isSubmitting,
    submitCount,
    submitError,
    
    // Computed
    isValid,
    isDirty,
    isTouched,
    
    // Methods
    defineRules,
    validate,
    validateField,
    setValue,
    setValues,
    setTouched,
    setError,
    clearError,
    clearErrors,
    reset,
    handleSubmit,
    field,
    
    // Validators (for custom rules)
    validators
  };
}

/**
 * Form submission with HTTP
 */
export function useFormSubmit(url, options = {}) {
  const {
    method = 'POST',
    transform,
    onSuccess,
    onError,
    ...httpOptions
  } = options;

  const form = useForm(options.initialValues || {}, {
    ...options,
    async onSubmit(values) {
      const data = transform ? transform(values) : values;
      
      try {
        const response = await http.request({
          url,
          method,
          data,
          ...httpOptions
        });

        if (onSuccess) {
          onSuccess(response.data, response);
        }

        return response.data;
      } catch (error) {
        if (onError) {
          onError(error);
        }
        throw error;
      }
    }
  });

  return form;
}

/**
 * Serialize form element to object
 */
export function serializeForm(formElement) {
  const formData = new FormData(formElement);
  const data = {};

  for (const [key, value] of formData.entries()) {
    if (key in data) {
      // Handle multiple values (checkboxes, multi-select)
      if (!Array.isArray(data[key])) {
        data[key] = [data[key]];
      }
      data[key].push(value);
    } else {
      data[key] = value;
    }
  }

  return data;
}

/**
 * Debounced validation
 */
export function useDebouncedValidation(form, delay = 300) {
  let timeoutId = null;

  const debouncedValidate = (field) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      if (field) {
        form.validateField(field);
      } else {
        form.validate();
      }
    }, delay);
  };

  return debouncedValidate;
}

/**
 * Field array helper for dynamic fields
 */
export function useFieldArray(form, name, initialValue = []) {
  const fields = reactive([...initialValue]);

  // Sync with form values
  form.values[name] = fields;

  function append(value = {}) {
    fields.push(value);
  }

  function prepend(value = {}) {
    fields.unshift(value);
  }

  function insert(index, value = {}) {
    fields.splice(index, 0, value);
  }

  function remove(index) {
    fields.splice(index, 1);
  }

  function swap(indexA, indexB) {
    const temp = fields[indexA];
    fields[indexA] = fields[indexB];
    fields[indexB] = temp;
  }

  function move(from, to) {
    const item = fields.splice(from, 1)[0];
    fields.splice(to, 0, item);
  }

  function replace(index, value) {
    fields[index] = value;
  }

  function clear() {
    fields.length = 0;
  }

  return {
    fields,
    append,
    prepend,
    insert,
    remove,
    swap,
    move,
    replace,
    clear
  };
}

export default {
  useForm,
  useFormSubmit,
  serializeForm,
  useDebouncedValidation,
  useFieldArray
};
