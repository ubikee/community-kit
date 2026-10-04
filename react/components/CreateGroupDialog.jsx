import { useState } from 'react';
import { useCommunity } from '../context';

export default function CreateGroupDialog({ onClose, onCreated }) {
  const { api, t } = useCommunity();
  const [form, setForm] = useState({ name: '', description: '', visibility: 'public' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setError(t('groups.nameRequired'));
      return;
    }
    setSaving(true);
    setError('');
    try {
      const group = await api.createGroup(form);
      onCreated?.(group);
      onClose?.();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="ck-stack">
      {error && <p className="ck-error">{error}</p>}
      <label className="ck-field">
        <span className="ck-label">{t('groups.name')}</span>
        <input
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="ck-input"
          autoFocus
        />
      </label>
      <label className="ck-field">
        <span className="ck-label">{t('groups.description')}</span>
        <textarea
          rows={3}
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          className="ck-textarea"
        />
      </label>
      <label className="ck-field">
        <span className="ck-label">{t('groups.visibility')}</span>
        <select
          value={form.visibility}
          onChange={(e) => setForm({ ...form, visibility: e.target.value })}
          className="ck-input"
        >
          <option value="public">{t('groups.public')}</option>
          <option value="private">{t('groups.private')}</option>
        </select>
      </label>
      <div className="ck-dialog__actions">
        <button type="button" onClick={onClose} className="ck-btn ck-btn--ghost">
          {t('common.cancel')}
        </button>
        <button type="submit" disabled={saving} className="ck-btn ck-btn--primary">
          {saving ? t('common.saving') : t('groups.create')}
        </button>
      </div>
    </form>
  );
}
