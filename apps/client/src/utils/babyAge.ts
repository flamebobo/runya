export function formatBirthdayLabel(iso: string): string {
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return '';
  return `${match[1]}年${Number(match[2])}月${Number(match[3])}日`;
}

export function todayIsoDate(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatBabyAgeLabel(birthday: string, now = new Date()): string {
  const birth = new Date(`${birthday}T00:00:00`);
  if (Number.isNaN(birth.getTime())) return '成长中';

  let months =
    (now.getFullYear() - birth.getFullYear()) * 12 + (now.getMonth() - birth.getMonth());
  let days = now.getDate() - birth.getDate();
  if (days < 0) {
    months -= 1;
    const prevMonth = new Date(now.getFullYear(), now.getMonth(), 0);
    days += prevMonth.getDate();
  }

  if (months <= 0) {
    const diffDays = Math.max(
      0,
      Math.floor((now.getTime() - birth.getTime()) / (24 * 60 * 60 * 1000)),
    );
    return `${diffDays}天`;
  }

  return `${months}个月${days}天`;
}
