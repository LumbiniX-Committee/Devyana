interface WordmarkProps {
	className?: string;
}

export const Wordmark = ({ className = "" }: WordmarkProps) => (
	<span className={`wordmark ${className}`}>Vinaya</span>
);
