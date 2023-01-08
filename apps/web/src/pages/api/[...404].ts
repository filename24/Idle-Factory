import type { NextApiRequest, NextApiResponse } from 'next'

type Data = {
  data: string
  code: number
}

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse<Data>
) {
  res.status(404).json({ data: 'Not found', code: 404 })
}
