// Browser storage belongs to an Echoo account, not to the Creator or Listener
// workspace. Keeping the namespace here makes a shared browser safe when one
// person signs out and another signs in.
export const getActiveAccountId = () => {
  try {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const id = user?.id || user?._id;
    return id ? String(id) : '';
  } catch {
    return '';
  }
};

export const accountStorageKey = (key) => {
  const accountId = getActiveAccountId();
  return accountId ? `${key}:${accountId}` : null;
};
