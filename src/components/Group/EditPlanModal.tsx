import React, { useState } from 'react';
import { X, Edit3, Sparkles, Calendar, MapPin, Clock } from 'lucide-react';
import { GroupItineraryActivity } from '../../services/itineraryRepository';
import { apiService } from '../../services/api';

interface EditPlanModalProps {
  isOpen: boolean;
  onClose: () => void;
  activities: GroupItineraryActivity[];
  onUpdateActivities: (updatedActivities: GroupItineraryActivity[]) => Promise<void>;
}

interface EditableSection {
  type: 'activity' | 'date' | 'time' | 'location';
  activityId: string;
  label: string;
  currentValue: string;
  originalValue: string;
}

const EditPlanModal: React.FC<EditPlanModalProps> = ({
  isOpen,
  onClose,
  activities,
  onUpdateActivities,
}) => {
  const [selectedSections, setSelectedSections] = useState<EditableSection[]>([]);
  const [editInstructions, setEditInstructions] = useState('');
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [regeneratedContent, setRegeneratedContent] = useState<Record<string, string>>({});

  // Group activities by date for better organization
  const activitiesByDate = activities.reduce((acc, activity) => {
    const date = activity.date;
    if (!acc[date]) {
      acc[date] = [];
    }
    acc[date].push(activity);
    return acc;
  }, {} as Record<string, GroupItineraryActivity[]>);

  const sortedDates = Object.keys(activitiesByDate).sort();

  // Generate editable sections from activities
  const generateEditableSections = (): EditableSection[] => {
    const sections: EditableSection[] = [];
    
    sortedDates.forEach(date => {
      const dateActivities = activitiesByDate[date];
      
      // Add date section
      sections.push({
        type: 'date',
        activityId: `date-${date}`,
        label: `Date: ${new Date(date).toLocaleDateString('en-US', {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
        })}`,
        currentValue: date,
        originalValue: date,
      });

      // Add activity sections
      dateActivities.forEach(activity => {
        sections.push({
          type: 'activity',
          activityId: activity.id,
          label: `Activity: ${activity.title}`,
          currentValue: activity.title,
          originalValue: activity.title,
        });

        if (activity.description) {
          sections.push({
            type: 'activity',
            activityId: `${activity.id}-description`,
            label: `Description for: ${activity.title}`,
            currentValue: activity.description,
            originalValue: activity.description,
          });
        }

        if (activity.location?.name) {
          sections.push({
            type: 'location',
            activityId: `${activity.id}-location`,
            label: `Location for: ${activity.title}`,
            currentValue: activity.location.name,
            originalValue: activity.location.name,
          });
        }

        if (activity.startTime) {
          sections.push({
            type: 'time',
            activityId: `${activity.id}-startTime`,
            label: `Start time for: ${activity.title}`,
            currentValue: activity.startTime,
            originalValue: activity.startTime,
          });
        }

        if (activity.endTime) {
          sections.push({
            type: 'time',
            activityId: `${activity.id}-endTime`,
            label: `End time for: ${activity.title}`,
            currentValue: activity.endTime,
            originalValue: activity.endTime,
          });
        }
      });
    });

    return sections;
  };

  const editableSections = generateEditableSections();

  const toggleSectionSelection = (section: EditableSection) => {
    setSelectedSections(prev => {
      const isSelected = prev.some(s => s.activityId === section.activityId);
      if (isSelected) {
        return prev.filter(s => s.activityId !== section.activityId);
      } else {
        return [...prev, section];
      }
    });
  };

  const handleRegenerate = async () => {
    if (selectedSections.length === 0 || !editInstructions.trim()) {
      return;
    }

    setIsRegenerating(true);
    try {
      // Prepare context for OpenAI API
      const context = selectedSections.map(section => ({
        type: section.type,
        currentValue: section.currentValue,
        label: section.label,
      }));

      // Call OpenAI API using the API service
      const result = await apiService.regeneratePlanParts({
        instructions: editInstructions,
        context,
        fullItinerary: activities,
      });
      
      // Store regenerated content
      const newRegeneratedContent: Record<string, string> = {};
      selectedSections.forEach((section, index) => {
        if (result.data.regeneratedContent[index]) {
          newRegeneratedContent[section.activityId] = result.data.regeneratedContent[index];
        }
      });
      
      setRegeneratedContent(newRegeneratedContent);
    } catch (error) {
      console.error('Error regenerating content:', error);
      // Handle error appropriately
    } finally {
      setIsRegenerating(false);
    }
  };

  const applyChanges = async () => {
    const updatedActivities = activities.map(activity => ({ ...activity }));

    // Apply all changes from regeneratedContent
    Object.entries(regeneratedContent).forEach(([activityId, newValue]) => {
      if (activityId.startsWith('date-')) {
        // Handle date changes (update all activities for that date)
        const oldDate = activityId.replace('date-', '');
        
        updatedActivities.forEach(activity => {
          if (activity.date === oldDate) {
            activity.date = newValue;
          }
        });
      } else if (activityId.includes('-description')) {
        // Handle description changes
        const actualActivityId = activityId.replace('-description', '');
        const activity = updatedActivities.find(a => a.id === actualActivityId);
        if (activity) {
          activity.description = newValue;
        }
      } else if (activityId.includes('-location')) {
        // Handle location changes
        const actualActivityId = activityId.replace('-location', '');
        const activity = updatedActivities.find(a => a.id === actualActivityId);
        if (activity) {
          activity.location = { name: newValue };
        }
      } else if (activityId.includes('-startTime')) {
        // Handle start time changes
        const actualActivityId = activityId.replace('-startTime', '');
        const activity = updatedActivities.find(a => a.id === actualActivityId);
        if (activity) {
          activity.startTime = newValue;
        }
      } else if (activityId.includes('-endTime')) {
        // Handle end time changes
        const actualActivityId = activityId.replace('-endTime', '');
        const activity = updatedActivities.find(a => a.id === actualActivityId);
        if (activity) {
          activity.endTime = newValue;
        }
      } else {
        // Handle activity title changes
        const activity = updatedActivities.find(a => a.id === activityId);
        if (activity) {
          activity.title = newValue;
        }
      }
    });
    
    // Call the update function with the properly modified activities
    await onUpdateActivities(updatedActivities);
    onClose();
  };

  const getSectionIcon = (type: EditableSection['type']) => {
    switch (type) {
      case 'activity':
        return <Edit3 className="h-4 w-4" />;
      case 'date':
        return <Calendar className="h-4 w-4" />;
      case 'time':
        return <Clock className="h-4 w-4" />;
      case 'location':
        return <MapPin className="h-4 w-4" />;
      default:
        return <Edit3 className="h-4 w-4" />;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
      <div className="glass-card p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-primary">Edit Plan</h2>
          <button
            onClick={onClose}
            className="text-muted hover:text-primary"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column - Section Selection */}
          <div>
            <h3 className="text-lg font-semibold text-primary mb-4">Select Parts to Edit</h3>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {editableSections.map((section) => {
                const isSelected = selectedSections.some(s => s.activityId === section.activityId);
                const hasRegenerated = regeneratedContent[section.activityId];
                
                return (
                  <div
                    key={section.activityId}
                    onClick={() => toggleSectionSelection(section)}
                    className={`p-4 rounded-lg border cursor-pointer transition-all ${
                      isSelected
                        ? 'border-orange-500 bg-orange-500/20 shadow-lg'
                        : 'border-white/20 hover:border-white/40 hover:bg-white/5'
                    } ${hasRegenerated ? 'ring-2 ring-green-500' : ''}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-1">
                        {getSectionIcon(section.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-primary truncate">
                          {section.label}
                        </p>
                        <p className="text-xs text-muted truncate mt-1">
                          {section.currentValue}
                        </p>
                        {hasRegenerated && (
                          <p className="text-xs text-green-400 font-medium mt-2 truncate">
                            → {hasRegenerated}
                          </p>
                        )}
                      </div>
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                        isSelected
                          ? 'border-orange-500 bg-orange-500'
                          : 'border-white/40'
                      }`}>
                        {isSelected && (
                          <div className="w-2 h-2 bg-white rounded-full"></div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column - Edit Instructions */}
          <div>
            <h3 className="text-lg font-semibold text-primary mb-4">Edit Instructions</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-secondary mb-2">
                  What would you like to change about the selected parts?
                </label>
                <textarea
                  value={editInstructions}
                  onChange={(e) => setEditInstructions(e.target.value)}
                  className="glass-input w-full px-4 py-3 rounded-lg h-32 resize-none"
                  placeholder="e.g., Make the activities more adventurous, change the timing to be more relaxed, suggest alternative locations..."
                />
              </div>

              {selectedSections.length > 0 && (
                <div className="p-3 bg-white/10 rounded-lg border border-white/20">
                  <p className="text-sm font-medium text-primary mb-2">
                    Selected: {selectedSections.length} part{selectedSections.length !== 1 ? 's' : ''}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {selectedSections.slice(0, 3).map(section => (
                      <span key={section.activityId} className="text-xs bg-white/20 px-3 py-1 rounded-full">
                        {section.label.split(':')[0]}
                      </span>
                    ))}
                    {selectedSections.length > 3 && (
                      <span className="text-xs bg-white/20 px-3 py-1 rounded-full">
                        +{selectedSections.length - 3} more
                      </span>
                    )}
                  </div>
                </div>
              )}

              <button
                onClick={handleRegenerate}
                disabled={selectedSections.length === 0 || !editInstructions.trim() || isRegenerating}
                className="w-full premium-button-primary flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Sparkles className="h-4 w-4" />
                {isRegenerating ? 'Regenerating...' : 'Regenerate with AI'}
              </button>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-4 pt-6 border-t border-white/10 mt-6">
          <button
            onClick={onClose}
            className="flex-1 premium-button-secondary"
          >
            Cancel
          </button>
          <button
            onClick={applyChanges}
            disabled={Object.keys(regeneratedContent).length === 0}
            className="flex-1 premium-button-primary disabled:opacity-50"
          >
            Apply Changes
          </button>
        </div>
      </div>
    </div>
  );
};

export default EditPlanModal;
