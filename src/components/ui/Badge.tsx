type Variant = 'red' | 'green' | 'yellow' | 'blue' | 'gray' | 'black';

const styles: Record<Variant, string> = {
  red:    'bg-brand-redLight text-brand-red border-brand-redMid',
  green:  'bg-green-50 text-green-700 border-green-200',
  yellow: 'bg-amber-50 text-amber-700 border-amber-200',
  blue:   'bg-blue-50 text-blue-700 border-blue-200',
  gray:   'bg-gray-100 text-gray-600 border-gray-200',
  black:  'bg-brand-charcoal text-white border-transparent',
};

interface Props {
  label: string;
  variant?: Variant;
  size?: 'sm' | 'md';
}

export default function Badge({ label, variant = 'gray', size = 'sm' }: Props) {
  return (
    <span className={`inline-flex items-center border rounded-md font-semibold ${styles[variant]} ${size === 'sm' ? 'text-xs px-2 py-0.5' : 'text-sm px-2.5 py-1'}`}>
      {label}
    </span>
  );
}
