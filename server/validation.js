export const STATUSES = ['New', 'Contacted', 'Qualified', 'Lost'];
export const SOURCES = ['Website', 'Referral', 'Social media', 'Email campaign', 'Event', 'Other'];

export function validateLead(input = {}) {
  const fields = ['name', 'email', 'phone', 'company', 'source'];
  const errors = {};
  const values = {};
  for (const field of fields) {
    values[field] = typeof input[field] === 'string' ? input[field].trim() : '';
    if (!values[field]) errors[field] = `${field[0].toUpperCase()}${field.slice(1)} is required.`;
    else if (values[field].length > 200) errors[field] = `${field[0].toUpperCase()}${field.slice(1)} must be 200 characters or fewer.`;
  }
  if (values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) errors.email = 'Enter a valid email address.';
  if (values.phone && !/^[+\d][\d\s().-]{5,24}$/.test(values.phone)) errors.phone = 'Enter a valid phone number.';
  if (values.source && !SOURCES.includes(values.source)) errors.source = 'Choose a valid lead source.';
  const status = input.status === undefined ? 'New' : input.status;
  if (!STATUSES.includes(status)) errors.status = 'Choose a valid status.';
  return { errors, values: { ...values, status } };
}
