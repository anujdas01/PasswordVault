import { HttpError } from './utils/httpError.js';

const isString = (v) => typeof v === 'string';
const isNumber = (v) => typeof v === 'number' && Number.isFinite(v);
const isBoolean = (v) => typeof v === 'boolean';
const isArray = (v) => Array.isArray(v);

const required = (value, field) => {
  if (value === undefined || value === null || value === '') {
    throw new HttpError(400, `${field} is required`);
  }
  return value;
};

const string = (value, { field, min, max, allowEmpty = false } = {}) => {
  if (!isString(value)) {
    throw new HttpError(400, `${field} must be a string`);
  }
  if (!allowEmpty && value.trim() === '') {
    throw new HttpError(400, `${field} is required`);
  }
  if (min !== undefined && value.length < min) {
    throw new HttpError(400, `${field} must be at least ${min} characters`);
  }
  if (max !== undefined && value.length > max) {
    throw new HttpError(400, `${field} must be at most ${max} characters`);
  }
  return value;
};

const number = (value, { field, min, max, integer = false } = {}) => {
  if (!isNumber(value)) {
    throw new HttpError(400, `${field} must be a number`);
  }
  if (integer && !Number.isInteger(value)) {
    throw new HttpError(400, `${field} must be an integer`);
  }
  if (min !== undefined && value < min) {
    throw new HttpError(400, `${field} must be at least ${min}`);
  }
  if (max !== undefined && value > max) {
    throw new HttpError(400, `${field} must be at most ${max}`);
  }
  return value;
};

const boolean = (value, { field, default: def = false } = {}) => {
  if (value === undefined || value === null) { return def; }
  if (!isBoolean(value)) {
    throw new HttpError(400, `${field} must be a boolean`);
  }
  return value;
};

const array = (value, { field, allowEmpty = true } = {}) => {
  if (!isArray(value)) {
    throw new HttpError(400, `${field} must be an array`);
  }
  if (!allowEmpty && value.length === 0) {
    throw new HttpError(400, `${field} must not be empty`);
  }
  return value;
};

export { required, string, number, boolean, array, HttpError };
