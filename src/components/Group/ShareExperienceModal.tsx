import React, { useState } from 'react';
import { X, Upload, MapPin, Users, Camera } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { getAuthenticatedSupabaseClient } from '../../config/supabase';

interface ShareExperienceModalProps {
  isOpen: boolean;
  onClose: () => void;
  tripId: string;
  tripName: string;
  destination: string;
}

const ShareExperienceModal: React.FC<ShareExperienceModalProps> = ({
  isOpen,
  onClose,
  tripId,
  tripName,
  destination
}) => {
  const [caption, setCaption] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [tags, setTags] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const { user } = useAuth();

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      setSelectedFiles(prev => [...prev, ...files].slice(0, 5)); // Max 5 files
    }
  };

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const items = e.dataTransfer.files;
    if (items && items.length) {
      const files = Array.from(items);
      setSelectedFiles(prev => [...prev, ...files].slice(0, 5));
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !caption.trim()) return;

    setIsUploading(true);
    try {
      const supabase = await getAuthenticatedSupabaseClient();
      
      // Upload files to Supabase Storage
      const mediaUrls: string[] = [];
      for (const file of selectedFiles) {
        // Validate file type
        if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
          console.warn(`Skipping invalid file type: ${file.type}`);
          continue;
        }
        
        // Validate file size (max 10MB)
        const maxSize = 10 * 1024 * 1024; // 10MB
        if (file.size > maxSize) {
          console.warn(`Skipping file too large: ${file.name}`);
          continue;
        }
        
        // Generate unique filename
        const fileExtension = file.name.split('.').pop() || 'jpg';
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExtension}`;
        const filePath = `posts/${user.uid}/${fileName}`;
        
        // Upload to Supabase Storage
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('posts')
          .upload(filePath, file, {
            cacheControl: '3600',
            upsert: false
          });
        
        if (uploadError) {
          console.error('Error uploading file:', uploadError);
          throw uploadError;
        }
        
        // Get public URL
        const { data: urlData } = supabase.storage
          .from('posts')
          .getPublicUrl(filePath);
        
        mediaUrls.push(urlData.publicUrl);
      }
      
      if (mediaUrls.length === 0) {
        throw new Error('No valid files were uploaded');
      }

      // Create post document in Supabase
      const { error: postError } = await supabase
        .from('posts')
        .insert({
          author_id: user.uid,
          trip_id: tripId,
          caption: caption.trim(),
          media_urls: mediaUrls,
          location: destination,
          tags: tags.split(',').map(tag => tag.trim()).filter(tag => tag),
          likes_count: 0,
          comments_count: 0,
        });

      if (postError) {
        console.error('Error creating post:', postError);
        throw postError;
      }

      // Update user's trips_count in Supabase
      const { data: userData } = await supabase
        .from('users')
        .select('trips_count')
        .eq('id', user.uid)
        .single();

      const currentCount = (userData?.trips_count || 0) as number;

      await supabase
        .from('users')
        .update({ trips_count: currentCount + 1 })
        .eq('id', user.uid);

      // Reset form and close modal
      setCaption('');
      setSelectedFiles([]);
      setTags('');
      onClose();
    } catch (error) {
      console.error('Error sharing experience:', error);
      alert('Failed to share experience. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-2xl font-bold text-gray-900">Share Your Experience</h2>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Trip Info */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="font-semibold text-gray-900 mb-2">{tripName}</h3>
            <div className="flex items-center text-gray-600">
              <MapPin className="h-4 w-4 mr-1" />
              <span className="text-sm">{destination}</span>
            </div>
          </div>

          {/* Caption */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Tell us about your experience
            </label>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Share your amazing travel story..."
              rows={4}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent resize-none"
              required
            />
          </div>

          {/* Photo Upload */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Add Photos/Videos (Max 5)
            </label>
            
            {/* File Input */}
            <div
              className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-orange-500 transition-colors"
              onDrop={handleDrop}
              onDragOver={handleDragOver}
            >
              <input
                type="file"
                multiple
                accept="image/*,video/*"
                onChange={handleFileSelect}
                className="hidden"
                id="file-upload"
                disabled={selectedFiles.length >= 5}
              />
              <label
                htmlFor="file-upload"
                className={`cursor-pointer ${selectedFiles.length >= 5 ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <Camera className="h-12 w-12 text-gray-400 mx-auto mb-2" />
                <p className="text-gray-600">
                  {selectedFiles.length >= 5 
                    ? 'Maximum 5 files selected' 
                    : 'Click to upload photos and videos'
                  }
                </p>
              </label>
            </div>

            {/* Selected Files Preview */}
            {selectedFiles.length > 0 && (
              <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-4">
                {selectedFiles.map((file, index) => (
                  <div key={index} className="relative">
                    <div className="aspect-square bg-gray-100 rounded-lg overflow-hidden">
                      {file.type.startsWith('image/') ? (
                        <img
                          src={URL.createObjectURL(file)}
                          alt={`Preview ${index + 1}`}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Camera className="h-8 w-8 text-gray-400" />
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFile(index)}
                      className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Tags */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Tags (comma separated)
            </label>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="beach, adventure, food, culture..."
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
            />
          </div>

          {/* Submit Button */}
          <div className="flex space-x-4 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              disabled={isUploading}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isUploading || !caption.trim()}
              className="flex-1 bg-orange-500 text-white px-6 py-3 rounded-lg font-semibold hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isUploading ? (
                <div className="flex items-center justify-center">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                  Sharing...
                </div>
              ) : (
                'Share Experience'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ShareExperienceModal;