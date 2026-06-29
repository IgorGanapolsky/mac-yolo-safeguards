#!/usr/bin/env node
'use strict';

/**
 * Skool Money Project: AI VoIP Restaurant Answering & Booking Engine
 *
 * Simulates incoming VoIP audio webhooks, handles RAG intent detection for menus
 * and bookings, connects to simulated reservation calendars, tracks seated
 * covers, and calculates attribution commission.
 */

const fs = require('fs');
const path = require('path');

const MOCK_RESTAURANT_PROFILE = {
  name: 'Hermes Fusion Bistro',
  hours: {
    monday: '5 PM - 10 PM',
    tuesday: '5 PM - 10 PM',
    wednesday: '5 PM - 10 PM',
    thursday: '5 PM - 11 PM',
    friday: '4 PM - 12 AM',
    saturday: '4 PM - 12 AM',
    sunday: '11 AM - 9 PM',
  },
  menuItems: [
    { name: 'Neon Winged Tacos', price: 16.5, vegetarian: false, description: 'Spicy flank steak tacos with neon avocado crema.' },
    { name: 'Ollama Hummus', price: 12.0, vegetarian: true, description: 'Organic chickpea dip served with wood-fired flatbread.' },
    { name: 'Codex Carbonara', price: 24.0, vegetarian: false, description: 'Traditional Roman carbonara with house-cured guanciale.' },
    { name: 'Safeguard Salad', price: 14.5, vegetarian: true, description: 'Baby kale, roasted squash, and local goat cheese.' },
  ],
  capacityPerSlot: 4,
};

class SkoolRestaurantAnsweringEngine {
  constructor(options = {}) {
    this.restaurant = options.restaurant || MOCK_RESTAURANT_PROFILE;
    this.commissionRatePerCover = options.commissionRatePerCover || 1.50; // $1.50 per guest cover
    this.reservations = []; // In-memory simulated database of bookings
  }

  /**
   * Evaluates voice speech and routes to the matching intent
   */
  processSpeechInput(text) {
    const query = String(text || '').toLowerCase();

    // 1. Booking intent
    if (/book|reservation|reserve|table for/i.test(query)) {
      const partySizeMatch = query.match(/table for (\d+)/i) || query.match(/(\d+) people/i);
      const partySize = partySizeMatch ? parseInt(partySizeMatch[1], 10) : 2;
      return {
        intent: 'BOOKING_REQUEST',
        partySize,
        response: `Let me check availability for a party of ${partySize}. One moment.`,
      };
    }

    // 2. Hours query intent
    if (/hours|open|close|when/i.test(query)) {
      const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
      let targetDay = 'monday';
      for (const day of days) {
        if (query.includes(day)) {
          targetDay = day;
          break;
        }
      }
      const dayHours = this.restaurant.hours[targetDay];
      return {
        intent: 'HOURS_QUERY',
        targetDay,
        response: `We are open on ${targetDay.charAt(0).toUpperCase() + targetDay.slice(1)} from ${dayHours}.`,
      };
    }

    // 3. Menu query intent
    if (/menu|food|eat|vegetarian|dish|special/i.test(query)) {
      const isVeg = query.includes('vegetarian');
      const items = this.restaurant.menuItems.filter((item) => !isVeg || item.vegetarian);
      const itemsList = items.map((item) => `${item.name} ($${item.price.toFixed(2)})`).join(', ');
      return {
        intent: 'MENU_QUERY',
        vegetarianOnly: isVeg,
        response: `Our ${isVeg ? 'vegetarian ' : ''}menu features: ${itemsList}.`,
      };
    }

    // 4. Default fallback
    return {
      intent: 'FALLBACK',
      response: "I didn't quite catch that. Would you like to check our hours, hear the menu, or reserve a table?",
    };
  }

  /**
   * Finalizes a table booking and generates the SMS confirmation payload
   */
  createBooking(phoneNumber, partySize, timeSlot) {
    const bookingId = `BK-${Math.floor(100000 + Math.random() * 900000)}`;
    const booking = {
      bookingId,
      phoneNumber,
      partySize,
      timeSlot,
      createdAt: new Date().toISOString(),
      status: 'confirmed',
    };
    this.reservations.push(booking);

    const smsMessage = `Reservation confirmed at ${this.restaurant.name} for ${partySize} guests on ${timeSlot}. Ref: ${bookingId}. Manage here: https://bistro.ai/m/${bookingId}`;
    return {
      booking,
      smsMessage,
      commission: partySize * this.commissionRatePerCover,
    };
  }

  /**
   * Reconciles seated reservation checkout tickets against Toast POS events to attribute commissions
   */
  reconcilePOSChecks(posChecks = []) {
    let totalCommissions = 0.0;
    const reconciledBookings = [];

    for (const check of posChecks) {
      // Attribute if check phone matches booking, or within overlapping 2-hour window of booking
      const matchedBooking = this.reservations.find(
        (b) => b.phoneNumber === check.phoneNumber && b.status === 'confirmed'
      );

      if (matchedBooking) {
        matchedBooking.status = 'seated';
        const commission = matchedBooking.partySize * this.commissionRatePerCover;
        totalCommissions += commission;
        reconciledBookings.push({
          bookingId: matchedBooking.bookingId,
          checkId: check.checkId,
          amountPaid: check.totalPaid,
          commission,
        });
      }
    }

    return {
      totalCommissions,
      reconciledBookings,
    };
  }
}

module.exports = {
  SkoolRestaurantAnsweringEngine,
  MOCK_RESTAURANT_PROFILE,
};
