import React from 'react';
import { Edit, Trash2, Clock, MapPin, User } from 'lucide-react';
import { GroupItineraryActivity } from '../../services/itineraryRepository';

interface ActivityCardProps {
  activity: GroupItineraryActivity;
  currentUserId: string;
  isLeader: boolean;
  onEdit: () => void;
  onDelete: () => void;
}

const ActivityCard: React.FC<ActivityCardProps> = ({
  activity,
  currentUserId,
  isLeader,
  onEdit,
  onDelete,
}) => {
  // Access control: Leaders can edit all, members can edit imported activities or their own
  const canEdit = isLeader || activity.ownerId === currentUserId || activity.importedFromUser;
  const isImported = activity.importedFromUser;

  const formatTime = (time: string | null) => {
    if (!time) return null;
    // Convert 24h format to 12h format if needed
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
  };

  const timeDisplay = () => {
    if (activity.startTime && activity.endTime) {
      return `${formatTime(activity.startTime)} - ${formatTime(activity.endTime)}`;
    } else if (activity.startTime) {
      return `Starts at ${formatTime(activity.startTime)}`;
    }
    return null;
  };

  return (
    <div className="glass-card p-4 hover:bg-white/10 transition-all">
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="font-semibold text-primary">{activity.title}</h4>
            {isImported && (
              <span className="text-xs bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded">
                Imported from {activity.ownerName}
              </span>
            )}
          </div>
          {activity.description && (
            <p className="text-secondary text-sm mb-2">{activity.description}</p>
          )}
        </div>
        {canEdit && (
          <div className="flex items-center gap-2 ml-4">
            <button
              onClick={onEdit}
              className="text-muted hover:text-primary transition-colors"
              title="Edit activity"
            >
              <Edit className="h-4 w-4" />
            </button>
            <button
              onClick={onDelete}
              className="text-muted hover:text-red-400 transition-colors"
              title="Delete activity"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-4 text-xs text-muted">
        {timeDisplay() && (
          <div className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            <span>{timeDisplay()}</span>
          </div>
        )}
        {activity.location?.name && (
          <div className="flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            <span>{activity.location.name}</span>
          </div>
        )}
        <div className="flex items-center gap-1">
          <User className="h-3 w-3" />
          <span>
            Added by {activity.ownerName}
            {activity.lastEditedBy !== activity.ownerId && 
              ` • Edited by ${activity.lastEditedBy === currentUserId ? 'you' : 'someone'}`}
          </span>
        </div>
      </div>

      {activity.lastEditedAt && (
        <div className="mt-2 text-xs text-muted">
          Last edited: {new Date(activity.lastEditedAt).toLocaleString()}
        </div>
      )}
    </div>
  );
};

export default ActivityCard;

