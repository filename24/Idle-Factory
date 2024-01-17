import { join } from 'path'
import { RotatingFileStream, createStream } from 'rotating-file-stream'
import { Logger as BaseLogger, ILogObj } from 'tslog'

export const enum LevelType {
  Silly,
  Trace,
  Debug,
  Info,
  Warn,
  Error,
  Fatal,
}

export class Logger extends BaseLogger<ILogObj> {
  public stream: RotatingFileStream

  constructor(scope: string, options: { logPath?: string }) {
    super({
      name: scope,
      type: 'pretty',
      prettyLogTimeZone: 'local',
      prettyLogTemplate:
        '{{yyyy}}.{{mm}}.{{dd}} {{hh}}:{{MM}}:{{ss}}:{{ms}} [ {{logLevelName}} ] [ {{name}} ]  ',
      minLevel: process.env.NODE_ENV === 'development' ? LevelType.Debug : LevelType.Info,
    })

    const path = options?.logPath || join(process.cwd(), 'logs', 'latest.log')

    this.stream = createStream(path, {
      size: '10M',
      interval: '1d',
      compress: 'gzip',
    })
    this.attachTransport((data) => {
      this.stream.write(JSON.stringify(data) + '\n')
    })
  }
}
