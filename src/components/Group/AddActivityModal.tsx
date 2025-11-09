import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { CreateActivityData, UpdateActivityData } from '../../services/itineraryRepository';

interface AddActivityModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CreateActivityData | UpdateActivityData) => Promise<void>;
  initialData?: CreateActivityData;
  isEditing?: boolean;
}

const AddActivityModal: React.FC<AddActivityModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  initialData,
  isEditing = false,
}) => {
  const [formData, setFormData] = useState<CreateActivityData>({
    title: '',
    description: '',
    date: '',
    startTime: '',
    endTime: '',
    location: { name: '' },
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setFormData({
          title: initialData.title || '',
          description: initialData.description || '',
          date: initialData.date || '',
          startTime: initialData.startTime || '',
          endTime: initialData.endTime || '',
          location: initialData.location || { name: '' },
        });
      } else {
        setFormData({
          title: '',
          description: '',
          date: '',
          startTime: '',
          endTime: '',
          location: { name: '' },
        });
      }
    }
  }, [isOpen, initialData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title || !formData.date) {
      return;
    }

    setLoading(true);
    try {
      await onSubmit(formData);
      onClose();
    } catch (error) {
      console.error('Error submitting activity:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="glass-card p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-primary">
            {isEditing ? 'Edit Activity' : 'Add Activity'}
          </h2>
          <button
            onClick={onClose}
            className="text-muted hover:text-primary"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-secondary mb-2">
              Title *
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, title: e.target.value }))
              }
              className="glass-input w-full px-4 py-3 rounded-lg"
              placeholder="e.g., Visit Taj Mahal"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-secondary mb-2">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, description: e.target.value }))
              }
              className="glass-input w-full px-4 py-3 rounded-lg"
              placeholder="Add details about this activity..."
              rows={3}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-secondary mb-2">
              Date *
            </label>
            <input
              type="date"
              value={formData.date}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, date: e.target.value }))
              }
              className="glass-input w-full px-4 py-3 rounded-lg"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-secondary mb-2">
                Start Time
              </label>
              <input
                type="time"
                value={formData.startTime}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, startTime: e.target.value }))
                }
                className="glass-input w-full px-4 py-3 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-secondary mb-2">
                End Time
              </label>
              <input
                type="time"
                value={formData.endTime}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, endTime: e.target.value }))
                }
                className="glass-input w-full px-4 py-3 rounded-lg"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-secondary mb-2">
              Location (Optional)
            </label>
            <input
              type="text"
              value={formData.location?.name || ''}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  location: { name: e.target.value },
                }))
              }
              className="glass-input w-full px-4 py-3 rounded-lg"
              placeholder="e.g., Taj Mahal, Agra"
            />
          </div>

          <div className="flex gap-4 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 premium-button-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 premium-button-primary disabled:opacity-50"
            >
              {loading ? 'Saving...' : isEditing ? 'Save Changes' : 'Add Activity'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddActivityModal;

