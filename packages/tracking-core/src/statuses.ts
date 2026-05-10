export const TrackingStatus = {
  CREATED: 'CREATED',
  BOOKED: 'BOOKED',
  LABEL_GENERATED: 'LABEL_GENERATED',
  ASSIGNED: 'ASSIGNED',

  PICKUP_SCHEDULED: 'PICKUP_SCHEDULED',
  PICKED_UP: 'PICKED_UP',

  AT_ORIGIN_HUB: 'AT_ORIGIN_HUB',
  DEPARTED_ORIGIN_HUB: 'DEPARTED_ORIGIN_HUB',

  IN_TRANSIT: 'IN_TRANSIT',

  AT_DESTINATION_HUB: 'AT_DESTINATION_HUB',
  OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',

  DELIVERY_ATTEMPTED: 'DELIVERY_ATTEMPTED',
  DELIVERED: 'DELIVERED',

  FAILED_DELIVERY: 'FAILED_DELIVERY',
  EXCEPTION: 'EXCEPTION',

  CUSTOMS_HOLD: 'CUSTOMS_HOLD',
  CUSTOMS_RELEASED: 'CUSTOMS_RELEASED',

  RETURN_STARTED: 'RETURN_STARTED',
  RETURNED: 'RETURNED',

  CANCELLED: 'CANCELLED'
} as const;

export type TrackingStatus = (typeof TrackingStatus)[keyof typeof TrackingStatus];

export const CUSTOMER_STATUS_MAP: Record<TrackingStatus, string> = {
  CREATED: 'Order received',
  BOOKED: 'Shipment booked',
  LABEL_GENERATED: 'Shipment prepared',
  ASSIGNED: 'Shipment assigned',
  PICKUP_SCHEDULED: 'Pickup scheduled',
  PICKED_UP: 'Picked up',
  AT_ORIGIN_HUB: 'Processing',
  DEPARTED_ORIGIN_HUB: 'In transit',
  IN_TRANSIT: 'In transit',
  AT_DESTINATION_HUB: 'Arrived near destination',
  OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERY_ATTEMPTED: 'Delivery attempted',
  DELIVERED: 'Delivered',
  FAILED_DELIVERY: 'Delivery issue',
  EXCEPTION: 'Delayed',
  CUSTOMS_HOLD: 'Delayed',
  CUSTOMS_RELEASED: 'In transit',
  RETURN_STARTED: 'Return started',
  RETURNED: 'Returned',
  CANCELLED: 'Cancelled'
};

export const CUSTOMER_MESSAGE_MAP: Record<TrackingStatus, string> = {
  CREATED: 'We have received your order and are preparing it for shipment.',
  BOOKED: 'Your shipment has been booked and is being prepared.',
  LABEL_GENERATED: 'A shipping label has been created for your parcel.',
  ASSIGNED: 'Your shipment has been assigned for collection.',
  PICKUP_SCHEDULED: 'A pickup has been scheduled for your parcel.',
  PICKED_UP: 'Your parcel has been collected and is on its way.',
  AT_ORIGIN_HUB: 'Your parcel is being processed at our facility.',
  DEPARTED_ORIGIN_HUB: 'Your parcel has left our facility and is in transit.',
  IN_TRANSIT: 'Your parcel is moving through the network.',
  AT_DESTINATION_HUB: 'Your parcel has arrived near its destination and is being prepared for delivery.',
  OUT_FOR_DELIVERY: 'Your parcel is with the delivery associate today.',
  DELIVERY_ATTEMPTED: 'A delivery was attempted but could not be completed.',
  DELIVERED: 'Your parcel has been delivered.',
  FAILED_DELIVERY: 'We were unable to complete the delivery. We will be in touch shortly.',
  EXCEPTION: 'Your shipment is delayed. We are working to resolve this as quickly as possible.',
  CUSTOMS_HOLD: 'Your shipment is delayed while additional checks are completed.',
  CUSTOMS_RELEASED: 'Your shipment has cleared customs and is in transit.',
  RETURN_STARTED: 'A return has been initiated for your shipment.',
  RETURNED: 'Your shipment has been returned.',
  CANCELLED: 'This shipment has been cancelled.'
};

export const ALLOWED_TRACKING_TRANSITIONS: Record<TrackingStatus, TrackingStatus[]> = {
  CREATED: ['BOOKED', 'CANCELLED'],
  BOOKED: ['LABEL_GENERATED', 'ASSIGNED', 'CANCELLED'],
  LABEL_GENERATED: ['ASSIGNED', 'PICKUP_SCHEDULED', 'CANCELLED'],
  ASSIGNED: ['PICKUP_SCHEDULED', 'PICKED_UP', 'CANCELLED'],
  PICKUP_SCHEDULED: ['PICKED_UP', 'CANCELLED'],
  PICKED_UP: ['AT_ORIGIN_HUB', 'IN_TRANSIT', 'EXCEPTION'],
  AT_ORIGIN_HUB: ['DEPARTED_ORIGIN_HUB', 'IN_TRANSIT', 'CUSTOMS_HOLD', 'EXCEPTION'],
  DEPARTED_ORIGIN_HUB: ['IN_TRANSIT', 'AT_DESTINATION_HUB', 'CUSTOMS_HOLD', 'EXCEPTION'],
  IN_TRANSIT: ['AT_DESTINATION_HUB', 'OUT_FOR_DELIVERY', 'CUSTOMS_HOLD', 'EXCEPTION', 'FAILED_DELIVERY'],
  AT_DESTINATION_HUB: ['OUT_FOR_DELIVERY', 'EXCEPTION'],
  OUT_FOR_DELIVERY: ['DELIVERED', 'DELIVERY_ATTEMPTED', 'FAILED_DELIVERY', 'EXCEPTION'],
  DELIVERY_ATTEMPTED: ['OUT_FOR_DELIVERY', 'FAILED_DELIVERY', 'EXCEPTION'],
  DELIVERED: ['RETURN_STARTED'],
  FAILED_DELIVERY: ['OUT_FOR_DELIVERY', 'RETURN_STARTED', 'EXCEPTION'],
  EXCEPTION: ['IN_TRANSIT', 'OUT_FOR_DELIVERY', 'FAILED_DELIVERY', 'CANCELLED'],
  CUSTOMS_HOLD: ['CUSTOMS_RELEASED', 'EXCEPTION', 'CANCELLED'],
  CUSTOMS_RELEASED: ['IN_TRANSIT', 'AT_DESTINATION_HUB'],
  RETURN_STARTED: ['RETURNED'],
  RETURNED: [],
  CANCELLED: []
};

export const TERMINAL_STATUSES: TrackingStatus[] = ['DELIVERED', 'RETURNED', 'CANCELLED'];

export const ACTIVE_STATUSES: TrackingStatus[] = [
  'CREATED', 'BOOKED', 'LABEL_GENERATED', 'ASSIGNED',
  'PICKUP_SCHEDULED', 'PICKED_UP', 'AT_ORIGIN_HUB',
  'DEPARTED_ORIGIN_HUB', 'IN_TRANSIT', 'AT_DESTINATION_HUB',
  'OUT_FOR_DELIVERY', 'DELIVERY_ATTEMPTED', 'FAILED_DELIVERY',
  'EXCEPTION', 'CUSTOMS_HOLD', 'CUSTOMS_RELEASED', 'RETURN_STARTED'
];
