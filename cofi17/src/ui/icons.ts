import {
  createElement,
  Search,
  Compass,
  Navigation,
  MapPin,
  Zap,
  X,
  Eye,
  User,
  Layers,
  DoorOpen,
  Sparkles,
  Utensils,
  Settings,
  RotateCw,
  ChevronRight,
  ChevronDown,
  Check,
  Footprints,
  Route,
  ChevronLeft,
  ZoomIn,
  ZoomOut,
  Maximize,
  type IconNode,
} from 'lucide';

export {
  ChevronLeft,
  ZoomIn,
  ZoomOut,
  Maximize,
  Search,
  Compass,
  Navigation,
  MapPin,
  Zap,
  X,
  Eye,
  User,
  Layers,
  DoorOpen,
  Sparkles,
  Utensils,
  Settings,
  RotateCw,
  ChevronRight,
  ChevronDown,
  Check,
  Footprints,
  Route,
};

export function makeIcon(iconNode: IconNode, size = 16, className = ''): SVGElement {
  const el = createElement(iconNode, {
    size,
    strokeWidth: 2.2,
    class: `lucide-icon ${className}`.trim(),
  }) as unknown as SVGElement;
  el.style.display = 'inline-block';
  el.style.verticalAlign = 'middle';
  el.style.flexShrink = '0';
  return el;
}
