export type EventBusEvents = Record<string, any>;

export type EventBusListenerCallback<EventPayload> = (payload: EventPayload) => void;

export type EventBusListener<EventPayload> = {
    callback: EventBusListenerCallback<EventPayload>;
    isClearAfterCall: boolean;
};

export class EventBus<Events extends EventBusEvents> {
    private listenersByEventType: {
        [eventType in keyof Events]?: Set<EventBusListener<Events[eventType]>>;
    } = {};

    subscribe<EventType extends keyof Events>({
        callback,
        eventType,
        isClearAfterCall = true,
    }: {
        eventType: EventType;
        callback: EventBusListenerCallback<Events[EventType]>;
        isClearAfterCall?: boolean;
    }) {
        const listener = {
            eventType,
            callback,
            isClearAfterCall,
        } as EventBusListener<Events[EventType]>;

        if (!this.listenersByEventType[eventType]) {
            this.listenersByEventType[eventType] = new Set();
        }

        this.listenersByEventType[eventType]!.add(listener);

        return () => {
            this.unsubscribe(eventType, listener);
        };
    }

    publish<EventType extends keyof Events>({
        eventType,
        payload,
    }: {
        eventType: EventType;
        payload: Events[EventType];
    }) {
        const listeners = this.listenersByEventType[eventType];
        if (!listeners) {
            return;
        }

        listeners.forEach((listener) => {
            const { callback, isClearAfterCall } = listener;

            callback(payload);

            if (isClearAfterCall) {
                this.unsubscribe(eventType, listener);
            }
        });
    }

    clear(eventType: keyof Events) {
        this.listenersByEventType[eventType]?.clear();
    }

    private unsubscribe<EventType extends keyof Events>(
        eventType: EventType,
        listener: EventBusListener<Events[EventType]>
    ) {
        const listeners = this.listenersByEventType[eventType];
        if (!listeners) {
            return;
        }

        listeners.delete(listener);
    }
}
