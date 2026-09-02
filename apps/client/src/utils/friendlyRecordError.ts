const ENGLISH_VALIDATION =
  /must contain at least|Expected number|Required|Invalid|too_small|too_big/i;

export function friendlyRecordError(message: string): string {
  if (!message.trim()) {
    return '还有一点点没填好，再看一眼';
  }
  if (/String must contain at least 1 character/i.test(message)) {
    return '先写一写今天吃了什么';
  }
  if (/Expected number|must be (greater|positive)|Number must be greater/i.test(message)) {
    return '先记下这一瓶喝了多少';
  }
  if (message === '结束时间不能早于开始时间') {
    return '醒来要比睡着晚一点点';
  }
  if (ENGLISH_VALIDATION.test(message) && !/[\u4e00-\u9fff]/.test(message)) {
    return '还有一点点没填好，再看一眼';
  }
  return message;
}
