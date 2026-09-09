import React from 'react';
import { StaffUser } from '../../types';
import { TableAccountsView as TableAccountsCoreView } from './TableAccountsCoreView';
import { PendingTransfersPanel } from './PendingTransfersPanel';

interface TableAccountsViewProps {
  currentUser: StaffUser;
}

export const TableAccountsView: React.FC<TableAccountsViewProps> = ({ currentUser }) => {
  return (
    <div className="space-y-5">
      <PendingTransfersPanel currentUser={currentUser} />
      <TableAccountsCoreView currentUser={currentUser} />
    </div>
  );
};
