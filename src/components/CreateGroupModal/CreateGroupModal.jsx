import React, { useState, useRef } from 'react';
import { BiX, BiLoader } from 'react-icons/bi';
import { useTranslation } from '../../hooks/useTranslation';
import { createGroup } from '../../services/groupService';
import { debugLog, debugError } from '../../utils/debug';
import './CreateGroupModal.css';

const CreateGroupModal = ({ isOpen, onClose, onGroupCreated, userId, userData }) => {
  const { t } = useTranslation();
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    currency: 'HKD',
  });
  const [errors, setErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const modalRef = useRef(null);

  const currencyOptions = [
    'USD',
    'EUR',
    'JPY',
    'CNY',
    'HKD',
  ];

  const validateForm = () => {
    const newErrors = {};

    if (!formData.name.trim()) {
      newErrors.name = t('createGroup.nameRequired') || 'Trip name is required';
    } else if (formData.name.length > 50) {
      newErrors.name = t('createGroup.nameTooLong') || 'Trip name must be less than 50 characters';
    }

    if (
      formData.description &&
      formData.description.length > 200
    ) {
      newErrors.description = t('createGroup.descriptionTooLong') || 'Description must be less than 200 characters';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
    // Clear error for this field when user starts typing
    if (errors[name]) {
      setErrors((prev) => ({
        ...prev,
        [name]: '',
      }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) return;

    setIsLoading(true);
    setSubmitError(null);
    setSubmitSuccess(false);

    try {
      const newGroup = await createGroup(userId, {
        name: formData.name.trim(),
        description: formData.description.trim(),
        currency: formData.currency,
        creatorName: userData?.displayName || 'Member',
        creatorEmail: userData?.email || '',
        creatorPhoto: userData?.photo || null,
      });

      setSubmitSuccess(true);
      setFormData({ name: '', description: '', currency: 'HKD' });

      // Close modal and navigate after short delay
      setTimeout(() => {
        onClose();
        if (onGroupCreated) {
          onGroupCreated(newGroup);
        }
      }, 500);
    } catch (error) {
      debugError('Error creating group', error);
      setSubmitError(
        error.message || t('createGroup.createError') || 'Failed to create trip. Please try again.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    setFormData({ name: '', description: '', currency: 'HKD' });
    setErrors({});
    setSubmitError(null);
    setSubmitSuccess(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="cgm-overlay" role="presentation" onClick={handleCancel}>
      <div
        className="cgm-content"
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        {submitSuccess && (
          <div className="cgm-success">
             {t('createGroup.createSuccess') || 'Trip created successfully!'}
          </div>
        )}

        <div className="cgm-header">
          <h2 id="modal-title" className="cgm-title">
            {t('createGroup.createTrip') || 'Create Trip'}
          </h2>
          <button
            className="cgm-close-btn"
            onClick={handleCancel}
            disabled={isLoading}
            aria-label="Close modal"
          >
            <BiX />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="cgm-form">
          {submitError && (
            <div className="cgm-error">{submitError}</div>
          )}

          <div className="cgm-form-group">
            <label htmlFor="cgm-name" className="cgm-form-label">
              {t('createGroup.tripName') || 'Trip Name'} <span className="cgm-required">*</span>
            </label>
            <input
              type="text"
              id="cgm-name"
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              placeholder={t('createGroup.tripNamePlaceholder') || 'e.g., Japan Trip 2026'}
              className={`cgm-input ${errors.name ? 'cgm-error' : ''}`}
              disabled={isLoading}
              maxLength="50"
            />
            <div className="cgm-char-count">
              {formData.name.length} / 50
            </div>
            {errors.name && (
              <div className="cgm-error-message">{errors.name}</div>
            )}
          </div>

          <div className="cgm-form-group">
            <label htmlFor="cgm-description" className="cgm-form-label">
              {t('createGroup.description') || 'Description'} ({t('createGroup.optional') || 'optional'})
            </label>
            <textarea
              id="cgm-description"
              name="description"
              value={formData.description}
              onChange={handleInputChange}
              placeholder={t('createGroup.descriptionPlaceholder') || 'e.g., Tokyo & Osaka 7 days'}
              className={`cgm-input ${errors.description ? 'cgm-error' : ''}`}
              disabled={isLoading}
              maxLength="200"
            />
            <div className="cgm-char-count">
              {formData.description.length} / 200
            </div>
            {errors.description && (
              <div className="cgm-error-message">{errors.description}</div>
            )}
          </div>

          <div className="cgm-form-group">
            <label htmlFor="cgm-currency" className="cgm-form-label">
              {t('createGroup.currency') || 'Currency'} <span className="cgm-required">*</span>
            </label>
            <select
              id="cgm-currency"
              name="currency"
              value={formData.currency}
              onChange={handleInputChange}
              className="cgm-input"
              disabled={isLoading}
            >
              {currencyOptions.map((curr) => (
                <option key={curr} value={curr}>
                  {curr}
                </option>
              ))}
            </select>
            <small className="cgm-form-note" style={{ color: '#FFC107', marginTop: '6px', display: 'block' }}>
              ⚠️ {t('createGroup.currencyWarning') || 'Currency cannot be changed after group creation. Please choose carefully.'}
            </small>
          </div>

          <div className="cgm-actions">
            <button
              type="button"
              className="cgm-btn cgm-btn-secondary"
              onClick={handleCancel}
              disabled={isLoading}
            >
              {t('common.cancel') || 'Cancel'}
            </button>
            <button
              type="submit"
              className="cgm-btn cgm-btn-primary"
              disabled={isLoading}
            >
              {isLoading && <BiLoader className="cgm-spinner" />}
              {isLoading ? (t('common.creating') || 'Creating...') : (t('createGroup.createTrip') || 'Create Trip')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateGroupModal;
