function isUnhealthy(status) {
  return (
    status === "CHANNEL_ERROR" ||
    status === "TIMED_OUT" ||
    status === "CLOSED"
  );
}

export function createRealtimeManager({
  supabase,
  userId,
  onMessagesEvent,
  onPresenceEvent,
  onFriendsEvent,
  onUsersEvent
}) {
  let messageChannel = null;
  let presenceChannel = null;
  let friendsChannel = null;
  let usersChannel = null;
  let reconnectTimer = null;

  const stopReconnectTimer = () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  const teardownChannels = async () => {
    if (messageChannel) {
      await supabase.removeChannel(messageChannel);
      messageChannel = null;
    }

    if (presenceChannel) {
      await supabase.removeChannel(presenceChannel);
      presenceChannel = null;
    }

    if (friendsChannel) {
      await supabase.removeChannel(friendsChannel);
      friendsChannel = null;
    }

    if (usersChannel) {
      await supabase.removeChannel(usersChannel);
      usersChannel = null;
    }
  };

  const scheduleReconnect = () => {
    stopReconnectTimer();
    reconnectTimer = setTimeout(() => {
      start().catch(() => {
        // Fallback refresh in main module handles data recovery.
      });
    }, 1400);
  };

  const onChannelStatus = (status) => {
    if (isUnhealthy(status)) {
      scheduleReconnect();
    }
  };

  const start = async () => {
    stopReconnectTimer();
    await teardownChannels();

    messageChannel = supabase
      .channel(`messages-${userId}-${Date.now()}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages"
        },
        (payload) => {
          const row = payload.new || payload.old;
          if (!row) return;

          const isParticipant =
            row.sender_id === userId ||
            row.receiver_id === userId;

          if (isParticipant) {
            onMessagesEvent(payload);
          }
        }
      )
      .subscribe(onChannelStatus);

    presenceChannel = supabase
      .channel(`presence-${userId}-${Date.now()}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "presence"
        },
        (payload) => {
          onPresenceEvent(payload);
        }
      )
      .subscribe(onChannelStatus);

    if (typeof onFriendsEvent === "function") {
      friendsChannel = supabase
        .channel(`friends-${userId}-${Date.now()}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "friends"
          },
          (payload) => {
            const row = payload.new || payload.old;
            if (!row) return;

            const isParticipant =
              row.user_id === userId ||
              row.friend_id === userId;

            if (isParticipant) {
              onFriendsEvent(payload);
            }
          }
        )
        .subscribe(onChannelStatus);
    }

    if (typeof onUsersEvent === "function") {
      usersChannel = supabase
        .channel(`users-${userId}-${Date.now()}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "users"
          },
          (payload) => {
            onUsersEvent(payload);
          }
        )
        .subscribe(onChannelStatus);
    }
  };

  const stop = async () => {
    stopReconnectTimer();
    await teardownChannels();
  };

  return {
    start,
    stop,
    reconnect: scheduleReconnect
  };
}
