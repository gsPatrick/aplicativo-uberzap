/**
 * Icon — substituto drop-in do `@expo/vector-icons/MaterialIcons`.
 *
 * Por quê: no Android release o @expo/vector-icons depende de carregar a FONTE
 * de ícones, e isso falhava (glifos sumiam) mesmo com a fonte embutida. Aqui os
 * ícones são SVG (lucide-react-native) — renderizam como vetor, sem fonte e sem
 * race de carregamento, então SEMPRE aparecem.
 *
 * API igual à do MaterialIcons: <Icon name="home" size={24} color="#fff" />.
 * Nome não mapeado cai num fallback (bolinha/emoji) — nunca some a tela.
 */
import React from 'react';
import { Text } from 'react-native';
import {
  Clock, Wallet, Plus, Camera, ArrowLeft, ArrowRight, ClipboardList, Badge,
  BatteryCharging, MessageCircle, Check, CircleCheck, ChevronLeft, ChevronRight,
  Circle, X, Nfc, CreditCard, LayoutDashboard, Trash2, FileText, Car, ScanLine,
  MapPin, CircleAlert, Calendar, LogOut, Compass, Smile, CircleQuestionMark,
  History, House, ChevronDown, Layers, Tag, LocateFixed, Crosshair, Lock, Mail,
  Map as MapIcon, Menu, Bike, Navigation, CameraOff, Bell, BellRing, Banknote,
  User, Phone, QrCode, MessageSquare, RefreshCw, Search, Shield, ShieldCheck,
  Send, Settings, Gauge, Star, Ruler, Timer, TrendingUp, BadgeCheck, Eye,
  KeyRound, TriangleAlert, Award,
} from 'lucide-react-native';

// Nome do MaterialIcons -> componente SVG do lucide
const MAP = {
  'access-time': Clock,
  'account-balance-wallet': Wallet,
  'add': Plus,
  'add-a-photo': Camera,
  'arrow-back': ArrowLeft,
  'arrow-forward': ArrowRight,
  'assignment-ind': ClipboardList,
  'badge': Badge,
  'battery-charging-full': BatteryCharging,
  'camera-alt': Camera,
  'camera-front': Camera,
  'chat': MessageCircle,
  'check': Check,
  'check-circle': CircleCheck,
  'check-circle-outline': CircleCheck,
  'chevron-left': ChevronLeft,
  'chevron-right': ChevronRight,
  'circle': Circle,
  'close': X,
  'contactless': Nfc,
  'credit-card': CreditCard,
  'dashboard': LayoutDashboard,
  'delete-forever': Trash2,
  'delete-sweep': Trash2,
  'description': FileText,
  'directions-car': Car,
  'document-scanner': ScanLine,
  'edit-location': MapPin,
  'error-outline': CircleAlert,
  'event': Calendar,
  'exit-to-app': LogOut,
  'explore': Compass,
  'face': Smile,
  'help-outline': CircleQuestionMark,
  'history': History,
  'home': House,
  'keyboard-arrow-down': ChevronDown,
  'layers': Layers,
  'local-offer': Tag,
  'location-on': MapPin,
  'location-searching': Crosshair,
  'lock': Lock,
  'lock-outline': Lock,
  'mail-outline': Mail,
  'map': MapIcon,
  'menu': Menu,
  'motorcycle': Bike,
  'my-location': LocateFixed,
  'navigation': Navigation,
  'no-photography': CameraOff,
  'notifications': Bell,
  'notifications-active': BellRing,
  'notifications-none': Bell,
  'payments': Banknote,
  'person': User,
  'phone': Phone,
  'photo-camera': Camera,
  'place': MapPin,
  'qr-code-scanner': QrCode,
  'rate-review': MessageSquare,
  'refresh': RefreshCw,
  'schedule': Clock,
  'search': Search,
  'security': Shield,
  'send': Send,
  'settings': Settings,
  'speed': Gauge,
  'star': Star,
  'star-border': Star,
  'straighten': Ruler,
  'timer': Timer,
  'trending-up': TrendingUp,
  'verified': BadgeCheck,
  'verified-user': ShieldCheck,
  'visibility': Eye,
  'vpn-key': KeyRound,
  'warning': TriangleAlert,
  'workspace-premium': Award,
};

// Ícones que ficam melhores PREENCHIDOS (em vez do contorno padrão do lucide)
const FILLED = new Set(['circle', 'place', 'location-on', 'star']);

// Emoji de emergência para qualquer nome que não esteja no mapa
const EMOJI = {
  'warning': '⚠️', 'check': '✓', 'close': '✕', 'star': '★',
  'home': '⌂', 'person': '☺', 'phone': '☎', 'search': '🔍',
};

export default function Icon({ name, size = 24, color = '#000', style, ...rest }) {
  const Cmp = MAP[name];
  if (Cmp) {
    const fillProps = FILLED.has(name) ? { fill: color } : null;
    return <Cmp size={size} color={color} strokeWidth={2} {...fillProps} style={style} {...rest} />;
  }
  // Fallback: emoji conhecido ou bolinha — garante que nunca fique vazio
  return (
    <Text style={[{ fontSize: size * 0.85, lineHeight: size, color, textAlign: 'center' }, style]}>
      {EMOJI[name] || '•'}
    </Text>
  );
}

// Compat: alguns arquivos importam { MaterialIcons } e renderizam <MaterialIcons .../>
export const MaterialIcons = Icon;
