import { useState } from 'react'
import { Button } from '../../../components/ui/Button'
import { BellIcon } from '../../../components/Icons'
import { useNotification } from '../../../hooks'
import { notificationStore } from '../../../store'
import { Toggle, SettingRow, SettingsCard } from './SettingsUI'

export function NotificationSettings() {
  const {
    enabled: notificationsEnabled,
    setEnabled: setNotificationsEnabled,
    supported: notificationsSupported,
    permission: notificationPermission,
    sendNotification,
  } = useNotification()
  const [toastEnabled, setToastEnabledState] = useState(notificationStore.toastEnabled)

  const handleTestNotification = () => {
    sendNotification('OpenCode', 'This is a test notification')
  }

  const handleToastToggle = () => {
    const v = !toastEnabled
    setToastEnabledState(v)
    notificationStore.setToastEnabled(v)
  }

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <SettingsCard title="System Notifications" description="Browser-level notifications when responses complete">
        {notificationsSupported ? (
          <div className="space-y-1.5">
            <SettingRow
              label="Notifications"
              description={
                notificationPermission === 'denied' ? 'Blocked by browser' : 'Notify when AI completes a response'
              }
              icon={<BellIcon size={14} />}
              onClick={() => notificationPermission !== 'denied' && setNotificationsEnabled(!notificationsEnabled)}
            >
              <Toggle
                enabled={notificationsEnabled && notificationPermission !== 'denied'}
                onChange={() => notificationPermission !== 'denied' && setNotificationsEnabled(!notificationsEnabled)}
              />
            </SettingRow>

            <SettingRow
              label="Test Notification"
              description={notificationsEnabled ? 'Send a sample notification' : 'Enable notifications to test'}
              icon={<BellIcon size={14} />}
            >
              <Button
                size="sm"
                variant="ghost"
                onClick={handleTestNotification}
                disabled={!notificationsEnabled || notificationPermission === 'denied'}
              >
                Send
              </Button>
            </SettingRow>
          </div>
        ) : (
          <div className="text-[12px] text-text-400 leading-relaxed">
            System notifications are not available in this environment
          </div>
        )}
      </SettingsCard>

      <SettingsCard title="In-App Alerts" description="Toast notifications for background session events">
        <SettingRow
          label="Toast Notifications"
          description="Show in-app toast popups"
          icon={<BellIcon size={14} />}
          onClick={handleToastToggle}
        >
          <Toggle enabled={toastEnabled} onChange={handleToastToggle} />
        </SettingRow>
      </SettingsCard>
    </div>
  )
}
