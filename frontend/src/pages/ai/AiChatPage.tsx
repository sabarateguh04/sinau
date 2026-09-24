import React from 'react';
import { useAuth } from '@/store/auth';
import { AiChatSinauModule } from '@/components/AiChatSinauModule';

export default function AiChatPage() {
  const { user, activeRole } = useAuth();

  return (
    <div className="h-[calc(100vh-4rem)] p-2 sm:p-4 flex flex-col">
      <div className="flex-1 bg-surface rounded-2xl border border-line shadow-soft overflow-hidden flex flex-col text-ink">
        <AiChatSinauModule
          key={user?.id || 'anonymous'}
          isFullPage={true}
          currentUser={user}
          activeRole={activeRole || undefined}
          activeMenu="AI Chat Bot Sinau"
        />
      </div>
    </div>
  );
}
