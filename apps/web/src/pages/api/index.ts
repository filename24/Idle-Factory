import type { NextApiRequest, NextApiResponse } from 'next'

type Data = {
  data: string
  code: number
}

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse<Data>
) {
  res.status(200).json({ data: 'Hello World', code: 200 })
}
