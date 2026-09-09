import React from 'react';
import { StaffUser } from '../../types';
import { RestaurantInfoEditorView as RestaurantInfoCoreView } from './RestaurantInfoCoreView';
import { PaymentSettingsEditorView } from './PaymentSettingsEditorView';

interface RestaurantInfoEditorViewProps {
  currentUser: StaffUser;
  onRefreshStats?: () => void;
}

export const RestaurantInfoEditorView: React.FC<RestaurantInfoEditorViewProps> = ({
  currentUser,
  onRefreshStats,
}) => {
  return (
    <div className="space-y-6">
      <RestaurantInfoCoreView currentUser={currentUser} onRefreshStats={onRefreshStats} />
      <PaymentSettingsEditorView currentUser={currentUser} />
    </div>
  );
};
