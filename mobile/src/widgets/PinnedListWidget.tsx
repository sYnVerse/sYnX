'widget';

import React from 'react';
import { createWidget } from 'expo-widgets';
import {
  Box,
  Row,
  Column,
  Text,
  Button,
  Checkbox,
  Spacer,
} from '@expo/ui/jetpack-compose';
import {
  padding,
  paddingAll,
  fillMaxSize,
  fillMaxWidth,
  size,
  background,
  cornerRadius,
} from '@expo/ui/jetpack-compose/modifiers';
import type { ListWidgetSnapshot, WidgetTaskItem } from '../shared/widget-snapshot';

export function PinnedListWidget(
  props: ListWidgetSnapshot,
  environment: { colorScheme?: 'light' | 'dark'; width?: number; height?: number }
) {
  const isDark = environment?.colorScheme !== 'light';
  const bg = isDark ? '#18181B' : '#FFFFFF';
  const cardBg = isDark ? '#27272A' : '#F4F4F5';
  const textPrimary = isDark ? '#F4F4F5' : '#18181B';
  const textMuted = isDark ? '#A1A1AA' : '#71717A';
  const accent = '#6366F1';
  const accentLight = isDark ? '#312E81' : '#EEF2FF';

  // Logged-out or uninitialized state
  if (!props?.isLoggedIn || !props?.listId) {
    return (
      <Column
        modifiers={[fillMaxSize(), paddingAll(16), background(bg), cornerRadius(16)]}
        horizontalAlignment="center"
        verticalArrangement="center"
      >
        <Text
          style={{ fontSize: 20, fontWeight: '800' }}
          color={textPrimary}
        >
          sYnX
        </Text>
        <Text
          style={{ fontSize: 13, fontWeight: '500' }}
          color={textMuted}
          modifiers={[padding(0, 4, 0, 12)]}
        >
          Pin a list in sYnX to view here
        </Text>
        <Button
          target="open:synx://"
          colors={{ containerColor: accent, contentColor: '#FFFFFF' }}
          modifiers={[padding(16, 8, 16, 8), cornerRadius(12)]}
        >
          <Text style={{ fontSize: 13, fontWeight: 'bold' }} color="#FFFFFF">
            Open sYnX
          </Text>
        </Button>
      </Column>
    );
  }

  const tasks = props.tasks || [];
  const displayTasks = tasks.slice(0, 5);

  return (
    <Column
      modifiers={[fillMaxSize(), paddingAll(12), background(bg), cornerRadius(16)]}
    >
      {/* Header bar */}
      <Row
        modifiers={[fillMaxWidth(), padding(0, 0, 0, 8)]}
        verticalAlignment="center"
        horizontalArrangement="spaceBetween"
      >
        <Button
          target={`open:synx://list/${props.listId}`}
          colors={{ containerColor: 'transparent', contentColor: textPrimary }}
        >
          <Row verticalAlignment="center">
            <Text
              style={{ fontSize: 15, fontWeight: 'bold' }}
              color={textPrimary}
              maxLines={1}
            >
              {`${props.categoryEmoji || '📌'} ${props.listTitle || 'Pinned List'}`}
            </Text>
            {props.ownershipLabel && props.ownershipLabel !== 'Yours' ? (
              <Box
                modifiers={[
                  padding(6, 2, 6, 2),
                  background(accentLight),
                  cornerRadius(6),
                ]}
              >
                <Text style={{ fontSize: 10, fontWeight: '600' }} color={accent}>
                  {props.ownershipLabel}
                </Text>
              </Box>
            ) : null}
          </Row>
        </Button>

        <Row verticalAlignment="center">
          <Box
            modifiers={[
              padding(6, 2, 6, 2),
              background(cardBg),
              cornerRadius(6),
            ]}
          >
            <Text style={{ fontSize: 11, fontWeight: '600' }} color={textMuted}>
              {`${props.doneCount}/${props.totalCount}`}
            </Text>
          </Box>

          {props.canEdit ? (
            <Button
              target={`open:synx://list/${props.listId}?action=newTask`}
              colors={{ containerColor: accent, contentColor: '#FFFFFF' }}
              modifiers={[padding(8, 4, 8, 4), cornerRadius(8)]}
            >
              <Text style={{ fontSize: 12, fontWeight: 'bold' }} color="#FFFFFF">
                + Add
              </Text>
            </Button>
          ) : null}
        </Row>
      </Row>

      {/* Task list or empty state */}
      {displayTasks.length === 0 ? (
        <Column
          modifiers={[fillMaxSize()]}
          horizontalAlignment="center"
          verticalArrangement="center"
        >
          <Text style={{ fontSize: 14, fontWeight: '500' }} color={textMuted}>
            {props.categoryEmoji === '⏰' ? 'No upcoming reminders ⏰' : 'All caught up! 🎉'}
          </Text>
          {props.canEdit ? (
            <Button
              target={`open:synx://list/${props.listId}?action=newTask`}
              colors={{ containerColor: cardBg, contentColor: accent }}
              modifiers={[padding(12, 6, 12, 6), cornerRadius(8)]}
            >
              <Text style={{ fontSize: 12, fontWeight: '600' }} color={accent}>
                + Add task
              </Text>
            </Button>
          ) : null}
        </Column>
      ) : (
        <Column modifiers={[fillMaxWidth()]} verticalArrangement={{ spacedBy: 4 }}>
          {displayTasks.map((task: WidgetTaskItem) => {
            const priorityDotColor =
              task.priority === 'high'
                ? '#EF4444'
                : task.priority === 'medium'
                ? '#F59E0B'
                : task.priority === 'low'
                ? '#3B82F6'
                : 'transparent';

            if (props.canEdit) {
              return (
                <Button
                  key={task.id}
                  target={`complete:${task.id}`}
                  colors={{ containerColor: 'transparent', contentColor: textPrimary }}
                  onClick={() => {
                    'worklet';
                    const nextTasks = (props.tasks || []).filter((t) => t.id !== task.id);
                    const pendingOps = [
                      ...(props.pendingOps || []),
                      {
                        todoId: task.id,
                        listId: props.listId,
                        completed: true,
                        at: Date.now(),
                      },
                    ];
                    return {
                      ...props,
                      tasks: nextTasks,
                      doneCount: (props.doneCount || 0) + 1,
                      pendingOps,
                    };
                  }}
                >
                  <Row
                    modifiers={[
                      fillMaxWidth(),
                      padding(6, 4, 6, 4),
                      background(cardBg),
                      cornerRadius(8),
                    ]}
                    verticalAlignment="center"
                  >
                    <Checkbox
                      value={false}
                      colors={{ checkedColor: accent, uncheckedColor: textMuted }}
                    />
                    {priorityDotColor !== 'transparent' ? (
                      <Box
                        modifiers={[
                          size(6, 6),
                          background(priorityDotColor),
                          cornerRadius(3),
                        ]}
                      />
                    ) : null}
                    <Text
                      style={{ fontSize: 13, fontWeight: '500' }}
                      color={textPrimary}
                      maxLines={1}
                      modifiers={[padding(6, 0, 6, 0)]}
                    >
                      {task.text}
                    </Text>
                    <Spacer />
                    {task.subtaskProgress ? (
                      <Text style={{ fontSize: 10 }} color={textMuted}>
                        {task.subtaskProgress}
                      </Text>
                    ) : null}
                    {task.reminderLabel ? (
                      <Text
                        style={{
                          fontSize: 10,
                          fontWeight: task.isOverdue ? 'bold' : 'normal',
                        }}
                        color={task.isOverdue ? '#EF4444' : textMuted}
                      >
                        {task.reminderLabel}
                      </Text>
                    ) : null}
                  </Row>
                </Button>
              );
            }

            return (
              <Row
                key={task.id}
                modifiers={[
                  fillMaxWidth(),
                  padding(6, 4, 6, 4),
                  background(cardBg),
                  cornerRadius(8),
                ]}
                verticalAlignment="center"
              >
                {priorityDotColor !== 'transparent' ? (
                  <Box
                    modifiers={[
                      size(6, 6),
                      background(priorityDotColor),
                      cornerRadius(3),
                    ]}
                  />
                ) : null}
                <Text
                  style={{ fontSize: 13, fontWeight: '500' }}
                  color={textPrimary}
                  maxLines={1}
                  modifiers={[padding(6, 0, 6, 0)]}
                >
                  {task.text}
                </Text>
                <Spacer />
                {task.subtaskProgress ? (
                  <Text style={{ fontSize: 10 }} color={textMuted}>
                    {task.subtaskProgress}
                  </Text>
                ) : null}
                {task.reminderLabel ? (
                  <Text style={{ fontSize: 10 }} color={textMuted}>
                    {task.reminderLabel}
                  </Text>
                ) : null}
              </Row>
            );
          })}
        </Column>
      )}
    </Column>
  );
}

export const initialSnapshot: ListWidgetSnapshot = {
  listId: '',
  listTitle: 'sYnX',
  categoryEmoji: '📌',
  canEdit: false,
  isOwner: true,
  ownershipLabel: '',
  tasks: [],
  doneCount: 0,
  totalCount: 0,
  pendingOps: [],
  isLoggedIn: false,
  lastUpdated: 0,
};

export default createWidget('PinnedListWidget', PinnedListWidget, initialSnapshot);
