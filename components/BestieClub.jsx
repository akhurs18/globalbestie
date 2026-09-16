'use client';

import { useState } from 'react';
import Reveal from './Reveal';
import Sparkle from './Sparkle';
import { channel, sendMessage } from '@/lib/site';

const CHAT = [
  ['Batch 12 is open! Closes Friday.', false],
  ['3 mini bags just restocked. Want first dibs?', false],
  ['YES the pink one pls', true],
  ['Done. Sending your final PKR price now.', false],
];

export default function BestieClub() {
  const [phone, setPhone] = useState('');
  const [copied, setCopied] = useState(false);

  async function submit(e) {
    e.preventDefault();
    const msg = `Hi Global Bestie! Please add me to the Bestie Club VIP list.${phone ? ` My WhatsApp: ${phone}` : ''}`;
    setCopied(await sendMessage(msg));
  }

  return (
    <section className="sec" id="club">
      <div className="wrap">
        <div className="club__card">
          <Reveal className="stack-lg">
            <p className="label">Bestie Club</p>
            <h2 className="h2">Get the drop before <span className="berry">everyone.</span></h2>
            <p className="lead">Join the VIP list: first look at every batch, restock alerts, and referral credits when your friends order.</p>
            <form className="club__form" onSubmit={submit}>
              <label className="sr-only" htmlFor="club-phone">Your WhatsApp number</label>
              <input
                id="club-phone"
                className="input"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="+92 3XX XXXXXXX"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
              <button className="btn btn--berry" type="submit">Join on {channel}</button>
            </form>
            {copied && <p className="form-note" role="status">Message copied. Paste it into our DMs.</p>}
            <p className="mono muted" style={{ fontSize: 10.5 }}>No spam. Leave anytime.</p>
          </Reveal>
          <Reveal className="phone-wrap" delay={150}>
            <div className="phone" aria-hidden="true">
              <div className="phone__head">
                <span className="avatar"><Sparkle size={16} tone="white" /></span>
                <span>
                  <b style={{ fontSize: 14 }}>Global Bestie VIP</b>
                  <br />
                  <span className="mono muted" style={{ fontSize: 10 }}>broadcast list</span>
                </span>
              </div>
              {CHAT.map(([text, out], i) => (
                <div key={i} className={`bubble ${out ? 'bubble--out' : ''}`} style={{ '--i': i }}>{text}</div>
              ))}
              <div className="phone__input">
                Message
                <span className="avatar" style={{ width: 30, height: 30 }}><Sparkle size={12} tone="white" /></span>
              </div>
            </div>
            <span className="sticker phone-sticker">VIP only</span>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
