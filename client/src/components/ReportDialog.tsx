import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '../lib/api';
import { REPORT_REASONS } from '../lib/constants';
import { Button, FormError, Modal, Select, Textarea } from './ui';

export type ReportTarget = 'user' | 'event' | 'post' | 'comment' | 'discussion' | 'message' | 'blood_request' | 'resource_request' | 'safety';

/** Report anything to the moderation team (REQ-TRUST-5). */
export function ReportDialog({ open, onClose, targetType, targetId, title = 'Report' }: { open: boolean; onClose: () => void; targetType: ReportTarget; targetId: string; title?: string }) {
  const [reason, setReason] = useState(targetType === 'safety' ? 'safety_concern' : '');
  const [details, setDetails] = useState('');
  const m = useMutation({
    mutationFn: () => api('/reports', { body: { targetType, targetId, reason, details: details || undefined } }),
    onSuccess: () => {
      toast.success('Report sent. Our moderators will review it.');
      onClose();
      setDetails('');
    },
  });
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="danger" disabled={!reason} loading={m.isPending} onClick={() => m.mutate()}>Send report</Button></>}>
      <div className="space-y-4">
        <p className="text-sm text-ink-soft">Reports are confidential — the person you report is not told who reported them.</p>
        <Select label="What's wrong?" value={reason} onChange={(e) => setReason(e.target.value)} options={REPORT_REASONS} placeholder="Choose a reason" />
        <Textarea label="Details" optional rows={3} value={details} onChange={(e) => setDetails(e.target.value)} maxLength={2000} placeholder="Anything that helps us understand" />
        <FormError error={m.error} />
      </div>
    </Modal>
  );
}
